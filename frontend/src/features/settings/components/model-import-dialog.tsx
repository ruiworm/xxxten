import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  ScrollArea,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components";
import { toast } from "@/components/toast";
import type {
  AvailableModel,
  Model,
  ModelCreateRequest,
  ModelProvider,
} from "@/lib/model.types";

import {
  createModel,
  fetchModelProviderCatalogModels,
  fetchProviderModels,
} from "../lib/model-api";

/** 与手动建表单保持一致的兜底上下文长度：低于 32K 会让 Agent 单轮直接溢出。 */
const DEFAULT_CONTEXT_LENGTH = 32768;
const PRESELECT_LIMIT = 3;

interface ModelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ModelProvider | null;
  /** 全部已建模型，用于判断哪些已经添加过 */
  models: Model[];
  isAgentSettingsLocked: boolean;
}

/**
 * 从内置模型目录批量导入某个连接下的模型。
 *
 * 上下文长度与四档价格直接取目录元数据，用户只需要挑模型；
 * 采样参数沿用建表单的默认值，导入后仍可在「模型」页微调。
 */
export function ModelImportDialog({
  open,
  onOpenChange,
  connection,
  models,
  isAgentSettingsLocked,
}: ModelImportDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const providerType = connection?.providerType ?? "";

  /**
   * 两份数据源各有短板，合并使用：
   * - 实时接口（/model-providers/{id}/models）反映该连接真实可用的模型，
   *   但中转服务通常不返回上下文与价格；
   * - 内置目录（Models.dev 快照）元数据齐全，却只覆盖原厂 type，
   *   自定义的 openai-compatible 连接查不到。
   * 所以以实时列表为准，用目录按 modelId 补元数据；实时为空时整体回退目录。
   */
  const { data, isLoading } = useQuery({
    queryKey: ["model-import", connection?.id, providerType],
    queryFn: async () => {
      if (!connection) return { models: [], usedRemote: false };

      let remote: AvailableModel[] = [];
      try {
        const result = await fetchProviderModels(connection.id, "llm");
        remote = result.models ?? [];
      } catch {
        // 连接不可用或未实现 /models，交给目录兜底
      }

      let catalog: AvailableModel[] = [];
      if (providerType) {
        try {
          const result = await fetchModelProviderCatalogModels(providerType, "llm");
          catalog = result.models ?? [];
        } catch {
          // openai-compatible 等自定义类型没有目录条目，属正常情况
        }
      }

      const catalogById = new Map(catalog.map((model) => [model.id, model]));
      const mergeMeta = (model: AvailableModel): AvailableModel => {
        const meta = catalogById.get(model.id);
        if (!meta) return model;
        return {
          ...model,
          contextWindow: model.contextWindow ?? meta.contextWindow ?? null,
          inputPricePerMillion: model.inputPricePerMillion ?? meta.inputPricePerMillion ?? null,
          outputPricePerMillion: model.outputPricePerMillion ?? meta.outputPricePerMillion ?? null,
          cacheReadPricePerMillion:
            model.cacheReadPricePerMillion ?? meta.cacheReadPricePerMillion ?? null,
          cacheWritePricePerMillion:
            model.cacheWritePricePerMillion ?? meta.cacheWritePricePerMillion ?? null,
          toolCall: model.toolCall ?? meta.toolCall ?? null,
        };
      };

      if (remote.length > 0) {
        return { models: remote.map(mergeMeta), usedRemote: true };
      }
      return { models: catalog, usedRemote: false };
    },
    enabled: open && Boolean(connection),
    staleTime: 60_000,
    retry: false,
  });

  /** 当前连接下已存在的 modelId，导入时跳过而不是覆盖 */
  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const model of models) {
      if (model.providerId === connection?.id) ids.add(model.modelId);
    }
    return ids;
  }, [models, connection?.id]);

  const candidates = useMemo(() => {
    const list = data?.models ?? [];
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return list;
    return list.filter(
      (model) =>
        model.id.toLowerCase().includes(normalized) ||
        model.name.toLowerCase().includes(normalized),
    );
  }, [data, keyword]);

  // 打开时预选：优先「声明支持工具调用」的模型，没有该元数据就退化为前几个
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setKeyword("");
      return;
    }
    const list = (data?.models ?? []).filter((model) => !existingIds.has(model.id));
    if (list.length === 0) return;
    const toolCapable = list.filter((model) => model.toolCall === true);
    const preferred = toolCapable.length > 0 ? toolCapable : list;
    setSelected(new Set(preferred.slice(0, PRESELECT_LIMIT).map((model) => model.id)));
  }, [open, data, existingIds]);

  const toggle = useCallback((modelId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }, []);

  const importMutation = useMutation({
    mutationFn: async (modelIds: string[]) => {
      if (!connection) return { created: 0, skipped: 0 };
      const byId = new Map((data?.models ?? []).map((model) => [model.id, model]));
      let created = 0;
      let skipped = 0;

      for (const modelId of modelIds) {
        if (existingIds.has(modelId)) {
          skipped += 1;
          continue;
        }
        const model = byId.get(modelId);
        if (!model) continue;

        const payload: ModelCreateRequest = {
          name: model.name || model.id,
          provider_id: connection.id,
          model_id: model.id,
          task_type: model.taskType ?? "llm",
          remark: "",
          temperature: 1,
          top_p: 1,
          top_k: 0,
          min_p: 0,
          top_a: 0,
          frequency_penalty: 0,
          presence_penalty: 0,
          repetition_penalty: 1,
          max_tokens: null,
          context_length: model.contextWindow ?? DEFAULT_CONTEXT_LENGTH,
          input_price: model.inputPricePerMillion ?? 0,
          output_price: model.outputPricePerMillion ?? 0,
          cache_read_price: model.cacheReadPricePerMillion ?? 0,
          cache_write_price: model.cacheWritePricePerMillion ?? 0,
          dimensions: null,
        };

        try {
          await createModel(payload);
          created += 1;
        } catch {
          // 单个失败不影响其余，计入跳过数
          skipped += 1;
        }
      }

      return { created, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      void queryClient.invalidateQueries({ queryKey: ["models"] });
      if (created > 0) toast.success(t("models.importSuccess", { count: created }));
      if (skipped > 0) toast.info(t("models.importSkipped", { count: skipped }));
      if (created === 0 && skipped === 0) return;
      onOpenChange(false);
    },
    onError: () => {
      toast.error(t("models.importFailed"));
    },
  });

  const handleImport = () => {
    if (selected.size === 0) return;
    importMutation.mutate([...selected]);
  };

  const isBusy = importMutation.isPending;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (isBusy) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Content
        maxWidth="620px"
        className="settings-background-panel"
        onOpenAutoFocus={(event) => {
          if (window.innerWidth < 768) event.preventDefault();
        }}
        style={{
          maxHeight: "82vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Dialog.Title>
          {t("models.importDialogTitle", {
            // 部分连接没有起名字，回退到地址或类型，避免标题出现「导入模型到 」
            provider: connection?.name || connection?.url || connection?.providerType || "",
          })}
        </Dialog.Title>
        <Text
          size="1"
          color="gray"
          mt="1"
        >
          {data?.usedRemote ? t("models.importRemoteHint") : t("models.importDialogHint")}
        </Text>

        <TextField.Root
          mt="3"
          placeholder={t("models.importSearchPlaceholder")}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        >
          <TextField.Slot>
            <Search size={14} />
          </TextField.Slot>
        </TextField.Root>

        <Box
          mt="3"
          style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        >
          {isLoading ? (
            <Flex
              align="center"
              justify="center"
              style={{ height: 220 }}
            >
              <Spinner />
            </Flex>
          ) : candidates.length === 0 ? (
            <Flex
              align="center"
              justify="center"
              style={{ height: 220 }}
            >
              <Text
                size="2"
                color="gray"
              >
                {(data?.models.length ?? 0) === 0
                  ? t("models.importNoSource")
                  : t("models.importEmpty")}
              </Text>
            </Flex>
          ) : (
            <ScrollArea style={{ maxHeight: "38vh" }}>
              <Flex
                direction="column"
                gap="1"
                pr="2"
              >
                {candidates.map((model) => {
                  const isExisting = existingIds.has(model.id);
                  const isChecked = selected.has(model.id);
                  return (
                    <Flex
                      key={model.id}
                      align="center"
                      gap="3"
                      py="2"
                      px="2"
                      style={{
                        borderRadius: "var(--radius-2)",
                        background: isChecked ? "var(--accent-a2)" : "transparent",
                        opacity: isExisting ? 0.55 : 1,
                      }}
                    >
                      <Checkbox
                        checked={isExisting || isChecked}
                        disabled={isExisting || isBusy}
                        onCheckedChange={() => toggle(model.id)}
                      />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          size="2"
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {model.name || model.id}
                        </Text>
                        <Text
                          size="1"
                          color="gray"
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {model.id}
                        </Text>
                      </Box>
                      {model.contextWindow ? (
                        <Badge
                          size="1"
                          variant="soft"
                          color="gray"
                        >
                          {Math.round(model.contextWindow / 1000)}K
                        </Badge>
                      ) : null}
                      {isExisting ? (
                        <Badge
                          size="1"
                          variant="soft"
                          color="gray"
                        >
                          {t("models.importAlreadyAdded")}
                        </Badge>
                      ) : null}
                    </Flex>
                  );
                })}
              </Flex>
            </ScrollArea>
          )}
        </Box>

        <Flex
          justify="between"
          align="center"
          mt="4"
          gap="3"
        >
          <Text
            size="1"
            color="gray"
          >
            {t("models.importSelectedCount", { count: selected.size })}
          </Text>
          <Flex gap="3">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                disabled={isBusy}
              >
                {t("common.cancel")}
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleImport}
              disabled={isBusy || isAgentSettingsLocked || selected.size === 0}
            >
              {isBusy ? <Spinner /> : t("models.importAction")}
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
