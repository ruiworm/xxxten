import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Minus, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { defaultDesktopConfig, type DesktopConfig, type DownloadSourcePreference } from "../../shared/config";

interface DesktopHeaderProps {
  config: DesktopConfig | null;
  disabled: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onAddInstance: () => void;
  onOpenSetup: () => void;
  onOpenDataManagement: () => void;
  onSaveConfig: (config: DesktopConfig) => Promise<void>;
}

type MenuName = "instance" | "window";

type MenuShortcut =
  | "menu-window"
  | "menu-instance"
  | "minimize-window"
  | "toggle-maximize"
  | "toggle-full-screen"
  | "zoom-in"
  | "zoom-out"
  | "reset-zoom"
  | "close-window"
  | "toggle-dev-tools";

function getMenuShortcut(event: KeyboardEvent): MenuShortcut | null {
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.code === "KeyW") return "menu-window";
    if (event.code === "KeyI") return "menu-instance";
  }
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

function isMenuShortcut(value: unknown): value is MenuShortcut {
  return typeof value === "string" && [
    "menu-window",
    "menu-instance",
    "minimize-window",
    "toggle-maximize",
    "toggle-full-screen",
    "zoom-in",
    "zoom-out",
    "reset-zoom",
    "close-window",
    "toggle-dev-tools",
  ].includes(value);
}

export function DesktopHeader({
  config,
  disabled,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onAddInstance,
  onOpenSetup,
  onOpenDataManagement,
  onSaveConfig,
}: DesktopHeaderProps) {
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const [visibleMenu, setVisibleMenu] = useState<MenuName | null>(null);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSourceMenuOpen(false);
  }, [openMenu]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (openMenu) {
      setVisibleMenu(openMenu);
      return;
    }

    const timeout = window.setTimeout(() => setVisibleMenu(null), 160);
    return () => window.clearTimeout(timeout);
  }, [openMenu]);

  useEffect(() => {
    void window.openficDesktop.getZoomFactor().then(setZoomFactor);
    return window.openficDesktop.onZoomFactorChanged(setZoomFactor);
  }, []);

  const handleAddInstance = () => {
    setOpenMenu(null);
    onAddInstance();
  };

  const handleOpenSetup = () => {
    setOpenMenu(null);
    onOpenSetup();
  };

  const handleOpenDataManagement = () => {
    setOpenMenu(null);
    onOpenDataManagement();
  };

  const handleChangeZoom = async (zoomChange: "in" | "out" | "reset") => {
    const nextZoomFactor = zoomChange === "reset"
      ? 1.1
      : zoomFactor + (zoomChange === "in" ? 0.1 : -0.1);
    setOpenMenu(null);
    await window.openficDesktop.saveZoomFactor(nextZoomFactor);
  };

  const handleHelpAction = (action: () => Promise<void>) => {
    setOpenMenu(null);
    void action();
  };

  const toggleMenu = (menu: MenuName) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const handleMenuShortcut = useEffectEvent((shortcut: MenuShortcut) => {
    if (shortcut === "menu-window") {
      setOpenMenu("window");
      return;
    }
    if (shortcut === "menu-instance") {
      setOpenMenu("instance");
      return;
    }
    if (shortcut === "minimize-window") {
      setOpenMenu(null);
      void window.openficDesktop.minimizeWindow();
      return;
    }
    if (shortcut === "toggle-maximize") {
      setOpenMenu(null);
      void window.openficDesktop.toggleMaximizeWindow();
      return;
    }
    if (shortcut === "toggle-full-screen") {
      setOpenMenu(null);
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
      setOpenMenu(null);
      void window.openficDesktop.closeWindow();
      return;
    }
    handleHelpAction(window.openficDesktop.toggleDevTools);
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = getMenuShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      handleMenuShortcut(shortcut);
    };
    const handleWebviewShortcut = (event: Event) => {
      const shortcut = (event as CustomEvent<unknown>).detail;
      if (isMenuShortcut(shortcut)) handleMenuShortcut(shortcut);
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
          <nav className="desktop-menu-bar" aria-label={t("desktop.header.appMenu")} ref={menuBarRef}>
          <div className="desktop-menu">
            <button
              className="desktop-menu-trigger"
              type="button"
              aria-expanded={openMenu === "window"}
              aria-haspopup="menu"
              onClick={() => toggleMenu("window")}
            >
              {t("desktop.header.windowMenu")}
            </button>
            {visibleMenu === "window" ? (
              <div
                className="desktop-menu-panel"
                data-state={openMenu === "window" ? "open" : "closed"}
                role="menu"
                aria-label={t("desktop.header.windowMenu")}
              >
                <button className="desktop-menu-item" type="button" role="menuitem" onClick={() => void window.openficDesktop.reloadWindow()}>
                  {t("desktop.header.reload")}
                </button>
                <span className="desktop-menu-separator" role="separator" />
                <button
                  className="desktop-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    void window.openficDesktop.minimizeWindow();
                  }}
                >
                  <span>{t("desktop.header.minimize")}</span>
                  <span className="desktop-menu-item-shortcut">Ctrl+M</span>
                </button>
                <button
                  className="desktop-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    void window.openficDesktop.toggleMaximizeWindow();
                  }}
                >
                  <span>{t("desktop.header.toggleMaximize")}</span>
                  <span className="desktop-menu-item-shortcut">Ctrl+Shift+M</span>
                </button>
                <button
                  className="desktop-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    void window.openficDesktop.toggleFullScreen();
                  }}
                >
                  <span>{t("desktop.header.toggleFullscreen")}</span>
                  <span className="desktop-menu-item-shortcut">F11</span>
                </button>
                <span className="desktop-menu-separator" role="separator" />
                <button className="desktop-menu-item" type="button" role="menuitem" onClick={() => void handleChangeZoom("in")}>
                  <span>{t("desktop.header.zoomIn")}</span>
                  <span className="desktop-menu-item-shortcut">Ctrl++</span>
                </button>
                <button className="desktop-menu-item" type="button" role="menuitem" onClick={() => void handleChangeZoom("out")}>
                  <span>{t("desktop.header.zoomOut")}</span>
                  <span className="desktop-menu-item-shortcut">Ctrl+-</span>
                </button>
                <button className="desktop-menu-item" type="button" role="menuitem" onClick={() => void handleChangeZoom("reset")}>
                  <span>{t("desktop.header.resetZoom")}</span>
                  <span className="desktop-menu-item-shortcut">Ctrl+0</span>
                  <span className="desktop-menu-item-value">{Math.round(zoomFactor * 100)}%</span>
                </button>
                <span className="desktop-menu-separator" role="separator" />
                <button className="desktop-menu-item" type="button" role="menuitem" onClick={() => void window.openficDesktop.closeWindow()}>
                  <span>{t("desktop.header.quitApp")}</span>
                  <span className="desktop-menu-item-shortcut">Ctrl+Q</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="desktop-menu">
            <button
              className="desktop-menu-trigger"
              type="button"
              aria-expanded={openMenu === "instance"}
              aria-haspopup="menu"
              onClick={() => toggleMenu("instance")}
            >
              {t("desktop.header.instanceMenu")}
            </button>
            {visibleMenu === "instance" ? (
              <div
                className="desktop-menu-panel"
                data-state={openMenu === "instance" ? "open" : "closed"}
                role="menu"
                aria-label={t("desktop.header.instance")}
              >
                <button className="desktop-menu-item" type="button" role="menuitem" disabled={disabled} onClick={handleAddInstance}>
                  {t("desktop.header.addInstance")}
                </button>
                <button className="desktop-menu-item" type="button" role="menuitem" disabled={disabled} onClick={handleOpenSetup}>
                  {t("desktop.header.manageInstances")}
                </button>
                <button
                  className="desktop-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={handleOpenDataManagement}
                >
                  {t("desktop.header.dataManagement")}
                </button>
                <span className="desktop-menu-separator" role="separator" />
                <div
                  className="desktop-source-menu"
                  onMouseEnter={() => setSourceMenuOpen(true)}
                  onMouseLeave={() => setSourceMenuOpen(false)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setSourceMenuOpen(false);
                  }}
                >
                  <button
                    className="desktop-menu-item desktop-source-trigger"
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={sourceMenuOpen && openMenu === "instance"}
                    onClick={() => setSourceMenuOpen((open) => !open)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                        event.preventDefault();
                        setSourceMenuOpen(true);
                        const menu = event.currentTarget.parentElement;
                        requestAnimationFrame(() => menu?.querySelector<HTMLButtonElement>("[role=menuitemradio]")?.focus());
                      }
                    }}
                  >
                    <span>{t("desktop.header.downloadSource")}</span>
                    <ChevronRight size={14} />
                  </button>
                  {sourceMenuOpen && openMenu === "instance" ? (
                    <div
                      className="desktop-menu-panel desktop-source-submenu"
                      data-state="open"
                      role="menu"
                      aria-label={t("desktop.header.downloadSource")}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft" || event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          setSourceMenuOpen(false);
                          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".desktop-source-trigger")?.focus();
                        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]")];
                          const index = items.indexOf(document.activeElement as HTMLButtonElement);
                          items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
                        }
                      }}
                    >
                      {(["auto", "default", "mirror"] as const).map((source: DownloadSourcePreference) => (
                        <button
                          className="desktop-menu-item desktop-source-option"
                          type="button"
                          role="menuitemradio"
                          aria-checked={(config?.downloadSource ?? "auto") === source}
                          disabled={savingSource}
                          key={source}
                          onClick={async () => {
                            setSavingSource(true);
                            setSourceError(null);
                            try {
                              await onSaveConfig({ ...(config ?? defaultDesktopConfig), downloadSource: source });
                              setOpenMenu(null);
                            } catch (error) {
                              setSourceError(error instanceof Error ? error.message : String(error));
                            } finally {
                              setSavingSource(false);
                            }
                          }}
                        >
                          <span className="desktop-source-check">{(config?.downloadSource ?? "auto") === source ? <Check size={14} /> : null}</span>
                          <span>{t(`desktop.header.downloadSources.${source}`)}</span>
                        </button>
                      ))}
                      {sourceError ? <span className="desktop-source-error" role="alert">{sourceError}</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </nav>
      </div>
      {visibleMenu ? (
        <button
          className="desktop-menu-scrim"
          data-state={openMenu ? "open" : "closed"}
          type="button"
          aria-label={t("desktop.header.closeMenu")}
          onClick={() => setOpenMenu(null)}
        />
      ) : null}
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
