import { apiClient } from "@/lib/api-client";

import type {
  DashboardBreakdownItem,
  DashboardFilterOptions,
  DashboardModelTimeSeriesPoint,
  DashboardQueryParams,
  DashboardStatsResponse,
  DashboardSummary,
  DashboardTimeSeriesPoint,
  WritingActivitySummary,
  WritingActivityTimeSeriesPoint,
  WritingDashboardQueryParams,
  WritingDashboardResponse,
} from "./dashboard.types";

interface RawDashboardSummary {
  calls_total: number;
  success_total: number;
  tokens_total: number;
  tokens_input_total: number;
  tokens_output_total: number;
  avg_latency_ms: number;
  avg_first_token_ms: number;
}

interface RawDashboardTimeSeriesPoint {
  date: string;
  calls: number;
  tokens_total: number;
  avg_latency_ms: number;
}

interface RawDashboardModelTimeSeriesPoint extends RawDashboardTimeSeriesPoint {
  key: string;
  label: string;
}

interface RawDashboardBreakdownItem {
  key: string;
  label: string;
  calls: number;
  tokens_total: number;
}

interface RawDashboardFilterOptions {
  project_ids: string[];
  model_providers: string[];
  model_ids: string[];
  categories: string[];
  operations: string[];
  statuses: string[];
  project_options: RawDashboardFilterOptionItem[];
  model_options: RawDashboardFilterOptionItem[];
}

interface RawDashboardFilterOptionItem {
  value: string;
  label: string;
}

interface RawDashboardStatsResponse {
  summary: RawDashboardSummary;
  model_time_series: RawDashboardModelTimeSeriesPoint[];
  by_model: RawDashboardBreakdownItem[];
  by_project: RawDashboardBreakdownItem[];
  options: RawDashboardFilterOptions;
}

interface RawWritingActivitySummary {
  active_days: number;
  creative_chapters: number;
}

interface RawWritingActivityTimeSeriesPoint {
  date: string;
  user_word_delta: number;
  agent_word_delta: number;
  import_word_delta: number;
}

interface RawWritingDashboardResponse {
  summary: RawWritingActivitySummary;
  time_series: RawWritingActivityTimeSeriesPoint[];
}

function transformSummary(raw: RawDashboardSummary): DashboardSummary {
  return {
    callsTotal: raw.calls_total,
    successTotal: raw.success_total,
    tokensTotal: raw.tokens_total,
    tokensInputTotal: raw.tokens_input_total,
    tokensOutputTotal: raw.tokens_output_total,
    avgLatencyMs: raw.avg_latency_ms,
    avgFirstTokenMs: raw.avg_first_token_ms,
  };
}

function transformTimeSeriesPoint(raw: RawDashboardTimeSeriesPoint): DashboardTimeSeriesPoint {
  return {
    date: raw.date,
    calls: raw.calls,
    tokensTotal: raw.tokens_total,
    avgLatencyMs: raw.avg_latency_ms,
  };
}

function transformModelTimeSeriesPoint(
  raw: RawDashboardModelTimeSeriesPoint,
): DashboardModelTimeSeriesPoint {
  return {
    ...transformTimeSeriesPoint(raw),
    key: raw.key,
    label: raw.label,
  };
}

function transformBreakdownItem(raw: RawDashboardBreakdownItem): DashboardBreakdownItem {
  return {
    key: raw.key,
    label: raw.label,
    calls: raw.calls,
    tokensTotal: raw.tokens_total,
  };
}

function transformOptions(raw: RawDashboardFilterOptions): DashboardFilterOptions {
  return {
    projectIds: raw.project_ids,
    modelProviders: raw.model_providers,
    modelIds: raw.model_ids,
    categories: raw.categories,
    operations: raw.operations,
    statuses: raw.statuses,
    projectOptions: raw.project_options.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    modelOptions: raw.model_options.map((option) => ({ value: option.value, label: option.label })),
  };
}

function transformWritingSummary(raw: RawWritingActivitySummary): WritingActivitySummary {
  return {
    activeDays: raw.active_days,
    creativeChapters: raw.creative_chapters,
  };
}

function transformWritingTimeSeriesPoint(
  raw: RawWritingActivityTimeSeriesPoint,
): WritingActivityTimeSeriesPoint {
  return {
    date: raw.date,
    userWordDelta: raw.user_word_delta,
    agentWordDelta: raw.agent_word_delta,
    importWordDelta: raw.import_word_delta,
  };
}

export async function fetchLlmDashboardStats(
  query: DashboardQueryParams,
): Promise<DashboardStatsResponse> {
  const response = await apiClient.get<RawDashboardStatsResponse>("/dashboard/llm-api/stats", {
    params: {
      project_id: query.projectId || undefined,
      model_provider: query.modelProvider || undefined,
      model_id: query.modelId || undefined,
      category: query.category || undefined,
      operation: query.operation || undefined,
      status: query.status || undefined,
      start_at: query.startAt || undefined,
      end_at: query.endAt || undefined,
    },
  });
  const raw = response.data;
  return {
    summary: transformSummary(raw.summary),
    modelTimeSeries: raw.model_time_series.map(transformModelTimeSeriesPoint),
    byModel: raw.by_model.map(transformBreakdownItem),
    byProject: raw.by_project.map(transformBreakdownItem),
    options: transformOptions(raw.options),
  };
}

export async function fetchWritingDashboard(
  query: WritingDashboardQueryParams,
): Promise<WritingDashboardResponse> {
  const response = await apiClient.get<RawWritingDashboardResponse>("/dashboard/writing", {
    params: {
      project_id: query.projectId || undefined,
      source: query.source || undefined,
      start_at: query.startAt || undefined,
      end_at: query.endAt || undefined,
      timezone: query.timezone || undefined,
    },
  });
  const raw = response.data;
  return {
    summary: transformWritingSummary(raw.summary),
    timeSeries: raw.time_series.map(transformWritingTimeSeriesPoint),
  };
}
