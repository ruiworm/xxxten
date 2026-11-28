import "./app-skeleton.css";

const NAV_ITEM_COUNT = 6;
const CARD_COUNT = 6;

/**
 * 首屏骨架。
 *
 * 后端（Python 进程）冷启动需要数秒，而前端静态资源在几百毫秒内就能渲染。
 * 这里先用与真实布局同构的占位块撑起界面，避免用户盯着全屏加载动画等待；
 * 真实数据到达后由 App 直接切换，占位块的结构与尺寸刻意贴近 AppLayout，
 * 以减少切换瞬间的布局跳动。
 */
export function AppSkeleton() {
  return (
    <div className="app-skeleton" aria-busy="true" aria-live="polite">
      <aside className="app-skeleton-sidebar">
        <div className="app-skeleton-block app-skeleton-brand" />
        <nav className="app-skeleton-nav">
          {Array.from({ length: NAV_ITEM_COUNT }, (_, index) => (
            <div key={index} className="app-skeleton-block app-skeleton-nav-item" />
          ))}
        </nav>
      </aside>

      <div className="app-skeleton-main">
        <header className="app-skeleton-toolbar">
          <div className="app-skeleton-block app-skeleton-title" />
          <div className="app-skeleton-block app-skeleton-action" />
        </header>
        <div className="app-skeleton-grid">
          {Array.from({ length: CARD_COUNT }, (_, index) => (
            <div key={index} className="app-skeleton-card">
              <div className="app-skeleton-block app-skeleton-card-title" />
              <div className="app-skeleton-block app-skeleton-card-meta" />
            </div>
          ))}
        </div>
      </div>

      <div className="app-skeleton-statusbar" />
    </div>
  );
}
