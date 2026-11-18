import { Navigate, useSearchParams } from "react-router";

type LegacySegment = "world-info" | "characters";

/**
 * 旧链接兼容：/world-info?projectId=x → /projects/x/world-info
 *
 * 0.13.10 之前世界观与角色是全局路由，项目 ID 放在查询参数里。
 * 改成项目作用域后保留这个跳转，避免用户书签和老文档里的链接失效。
 * 没有带 projectId 的旧链接无法判断属于哪个项目，统一退回项目库。
 */
export function LegacyProjectRedirect({ segment }: { segment: LegacySegment }) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");

  if (!projectId) return <Navigate to="/" replace />;

  const rest = new URLSearchParams(searchParams);
  rest.delete("projectId");
  const query = rest.toString();

  return <Navigate to={`/projects/${projectId}/${segment}${query ? `?${query}` : ""}`} replace />;
}
