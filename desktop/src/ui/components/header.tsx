import { useEffect, useEffectEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Minus, PanelLeft, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DesktopHeaderProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  /** 当前正在写的小说标题；未进入项目时为空串。 */
  documentTitle: string;
  onToggleSidebar: () => void;
}

type WindowShortcut =
  | "minimize-window"
  | "toggle-maximize"
  | "toggle-full-screen"
  | "zoom-in"
  | "zoom-out"
  | "reset-zoom"
  | "close-window"
  | "toggle-dev-tools";

const WINDOW_SHORTCUTS: WindowShortcut[] = [
  "minimize-window",
  "toggle-maximize",
  "toggle-full-screen",
  "zoom-in",
  "zoom-out",
  "reset-zoom",
  "close-window",
  "toggle-dev-tools",
];

/**
 * 「窗口」菜单去掉后，菜单项对应的快捷键保留下来，
 * 否则 F11 全屏、Ctrl +/- 缩放这些习惯操作会跟着失效。
 */
function getWindowShortcut(event: KeyboardEvent): WindowShortcut | null {
  if (event.key === "F11" && !event.ctrlKey && !event.altKey && !event.metaKey) return "toggle-full-screen";
  if (event.key === "F12" && !event.ctrlKey && !event.altKey && !event.metaKey) return "toggle-dev-tools";
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.shiftKey) {
    if (event.code === "KeyM") return "toggle-maximize";
    return null;
  }
  if (event.code === "KeyM") return "minimize-window";
  if (event.code === "Equal" || event.code === "NumpadAdd") return "zoom-in";
  if (event.code === "Minus" || event.code === "NumpadSubtract") return "zoom-out";
  if (event.code === "Digit0" || event.code === "Numpad0") return "reset-zoom";
  if (event.code === "KeyQ") return "close-window";
  return null;
}

function isWindowShortcut(value: unknown): value is WindowShortcut {
  return typeof value === "string" && WINDOW_SHORTCUTS.includes(value as WindowShortcut);
}

export function DesktopHeader({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  documentTitle,
  onToggleSidebar,
}: DesktopHeaderProps) {
  const { t } = useTranslation();
  const [zoomFactor, setZoomFactor] = useState(1);

  useEffect(() => {
    void window.openficDesktop.getZoomFactor().then(setZoomFactor);
    return window.openficDesktop.onZoomFactorChanged(setZoomFactor);
  }, []);

  const handleChangeZoom = async (zoomChange: "in" | "out" | "reset") => {
    const nextZoomFactor = zoomChange === "reset"
      ? 1.1
      : zoomFactor + (zoomChange === "in" ? 0.1 : -0.1);
    await window.openficDesktop.saveZoomFactor(nextZoomFactor);
  };

  const handleWindowShortcut = useEffectEvent((shortcut: WindowShortcut) => {
    if (shortcut === "minimize-window") {
      void window.openficDesktop.minimizeWindow();
      return;
    }
    if (shortcut === "toggle-maximize") {
      void window.openficDesktop.toggleMaximizeWindow();
      return;
    }
    if (shortcut === "toggle-full-screen") {
      void window.openficDesktop.toggleFullScreen();
      return;
    }
    if (shortcut === "zoom-in") {
      void handleChangeZoom("in");
      return;
    }
    if (shortcut === "zoom-out") {
      void handleChangeZoom("out");
      return;
    }
    if (shortcut === "reset-zoom") {
      void handleChangeZoom("reset");
      return;
    }
    if (shortcut === "close-window") {
      void window.openficDesktop.closeWindow();
      return;
    }
    void window.openficDesktop.toggleDevTools();
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = getWindowShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      handleWindowShortcut(shortcut);
    };
    const handleWebviewShortcut = (event: Event) => {
      const shortcut = (event as CustomEvent<unknown>).detail;
      if (isWindowShortcut(shortcut)) handleWindowShortcut(shortcut);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("openfic:menu-shortcut", handleWebviewShortcut);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("openfic:menu-shortcut", handleWebviewShortcut);
    };
  }, []);

  return (
    <header className="desktop-header">
      <div className="desktop-titlebar-left">
        <div
          className="desktop-brand"
          aria-hidden="true"
        >
          <span className="desktop-brand-mark" />
          <span className="desktop-brand-wordmark" />
        </div>
        <button
          className="titlebar-button"
          aria-label={t("desktop.header.toggleSidebar")}
          type="button"
          onClick={onToggleSidebar}
        >
          <PanelLeft size={15} strokeWidth={2} />
        </button>
        <nav className="desktop-navigation" aria-label={t("desktop.header.navigation")}>
          <button
            className="titlebar-button"
            aria-label={t("desktop.header.goBack")}
            type="button"
            disabled={!canGoBack}
            onClick={onGoBack}
          >
            <ArrowLeft size={15} strokeWidth={2} />
          </button>
          <button
            className="titlebar-button"
            aria-label={t("desktop.header.goForward")}
            type="button"
            disabled={!canGoForward}
            onClick={onGoForward}
          >
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        </nav>
      </div>

      {/* 中间留给「正在写的小说」，未进入项目时保持空白 */}
      <div className="desktop-titlebar-title">
        {documentTitle ? (
          <span
            className="desktop-titlebar-title-text"
            title={documentTitle}
          >
            {documentTitle}
          </span>
        ) : null}
      </div>

      <div className="desktop-titlebar-actions">
        <button
          className="titlebar-button"
          aria-label={t("desktop.header.minimizeWindow")}
          type="button"
          onClick={() => void window.openficDesktop.minimizeWindow()}
        >
          <Minus size={15} strokeWidth={2} />
        </button>
        <button
          className="titlebar-button"
          aria-label={t("desktop.header.maximizeWindow")}
          type="button"
          onClick={() => void window.openficDesktop.toggleMaximizeWindow()}
        >
          <Square size={14} strokeWidth={2} />
        </button>
        <button
          className="titlebar-button titlebar-button-close"
          aria-label={t("desktop.header.closeWindow")}
          type="button"
          onClick={() => void window.openficDesktop.closeWindow()}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
