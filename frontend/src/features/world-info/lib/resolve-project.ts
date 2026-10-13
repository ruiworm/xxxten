/**
 * 世界书页的「当前项目」选择逻辑。
 *
 * 世界书与项目 1:1，进入世界书页时必须先确定要看哪个项目。
 * 旧实现只在 store 里没有项目时才初始化，导致新建/切换项目后
 * 仍然停留在上一个项目的世界书（表现为「有时候不自动绑定世界书」）。
 *
 * 这里的优先级是固定的，抽成纯函数以便被测试覆盖。
 */

export interface ResolveWorldInfoProjectOptions {
  /** URL 上显式指定的项目（来自 ?projectId=）。 */
  urlProjectId?: string | null;
  /** 按「最近打开」排序的项目 ID 列表，索引 0 为最近打开。 */
  recentProjectIds?: readonly string[];
  /** 上次访问世界书页时记住的项目 ID。 */
  cachedProjectId?: string | null;
  /** 当前存在的全部项目 ID（通常按最近更新排序）。 */
  projectIds?: readonly string[];
}

export function resolveWorldInfoProjectId(options: ResolveWorldInfoProjectOptions): string | null {
  const available = options.projectIds ?? [];
  const exists = (id: string | null | undefined): id is string =>
    Boolean(id) && available.includes(id as string);

  // 1. URL 显式指定（从写作页跳转过来时最准）
  if (exists(options.urlProjectId)) return options.urlProjectId;

  // 2. 最近打开的项目 —— 也就是「你现在正在写的那个项目」
  const recent = (options.recentProjectIds ?? []).find((id) => exists(id));
  if (recent) return recent;

  // 3. 上次访问世界书页时记住的项目
  if (exists(options.cachedProjectId)) return options.cachedProjectId;

  // 4. 兜底：列表首个
  return available[0] ?? null;
}
