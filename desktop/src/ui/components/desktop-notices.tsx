import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DesktopNoticesProps {
  compatibilityWarning: string | null;
  onCloseCompatibilityWarning: () => void;
}

/**
 * 桌面外壳的提示条。
 *
 * 更新提示已整体移除：应用不再检查更新，也不再展示版本号或跳转任何外部地址。
 * 这里只保留「实例版本与桌面端不匹配」这一条本地告警。
 */
export function DesktopNotices({
  compatibilityWarning,
  onCloseCompatibilityWarning,
}: DesktopNoticesProps) {
  const { t } = useTranslation();

  if (!compatibilityWarning) return null;

  return (
    <aside className="desktop-notices" aria-live="polite">
      <section className="desktop-notice desktop-notice-warning" role="status">
        <AlertTriangle size={17} strokeWidth={2} aria-hidden="true" />
        <p>{compatibilityWarning}</p>
        <button
          className="desktop-notice-warning-dismiss"
          type="button"
          aria-label={t("desktop.notices.closeCompatibilityWarning")}
          onClick={onCloseCompatibilityWarning}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </section>
    </aside>
  );
}
