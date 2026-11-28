import { Box, Flex } from "@radix-ui/themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChartNoAxesCombined, Globe, LibraryBig, PenLine, UserRound, Workflow } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router";

import { toast } from "@/components";
import { useMobileSidebarSwipe } from "@/hooks/use-mobile-sidebar-swipe";
import { saveLanguagePreference, supportedLanguages, type LanguageCode } from "@/i18n";
import { apiClient, fetchProject } from "@/lib/api-client";
import { publishDesktopDocumentTitle } from "@/lib/desktop-appearance-bridge";
import { openRecentProject, removeRecentProjectByProjectId } from "@/lib/local-db";
import type { RecentProject } from "@/lib/recent-projects";
import type { ThemeMode } from "@/lib/theme";

import { useAppShell } from "./app-shell-context";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  type AppSidebarNavItem,
} from "./app-sidebar.constants";
import { SidebarActions } from "./sidebar-actions";
import { SidebarNav } from "./sidebar-nav";

const MotionBox = motion.create(Box);
const MotionFlex = motion.create(Flex);

interface AppSidebarProps {
  appearance: "light" | "dark";
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}

export function AppSidebar({ appearance, themeMode, onToggleTheme }: AppSidebarProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { isMobile, isSidebarOpen, closeSidebar, openSettings } = useAppShell();
  const queryClient = useQueryClient();
  const mobileSidebarSwipeHandlers = useMobileSidebarSwipe({
    isEnabled: isMobile,
    isOpen: isSidebarOpen,
    onClose: closeSidebar,
  });
  const mobileSidebarBackdropSwipeHandlers = useMobileSidebarSwipe({
    isEnabled: isMobile,
    isOpen: isSidebarOpen,
    onClose: closeSidebar,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldAnimateTheme, setShouldAnimateTheme] = useState(false);
  const prevAppearanceRef = useRef(appearance);
  const prevThemeModeRef = useRef(themeMode);
  const prevPathnameRef = useRef(location.pathname);
  const lastOpenedProjectIdRef = useRef<string | null>(null);

  const sidebarWidth = isMobile
    ? SIDEBAR_EXPANDED_WIDTH
    : isExpanded
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH;

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      `${isMobile ? 0 : sidebarWidth}px`,
    );
  }, [isMobile, sidebarWidth]);

  useEffect(() => {
    if (isMobile && isSidebarOpen && prevPathnameRef.current !== location.pathname) {
      closeSidebar();
    }

    prevPathnameRef.current = location.pathname;
  }, [closeSidebar, isMobile, isSidebarOpen, location.pathname]);

  useEffect(() => {
    if (
      (prevAppearanceRef.current !== appearance || prevThemeModeRef.current !== themeMode) &&
      shouldAnimateTheme
    ) {
      const timer = setTimeout(() => {
        setShouldAnimateTheme(false);
      }, 300);
      return () => clearTimeout(timer);
    }
    prevAppearanceRef.current = appearance;
    prevThemeModeRef.current = themeMode;
  }, [appearance, shouldAnimateTheme, themeMode]);

  const { data: currentProject, error: currentProjectError } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) lastOpenedProjectIdRef.current = null;
  }, [projectId]);

  // 标题栏由桌面壳绘制，这里把当前小说名同步过去；离开项目时置空，标题栏留白。
  useEffect(() => {
    publishDesktopDocumentTitle(currentProject?.title ?? "");
  }, [currentProject?.title]);

  useEffect(() => {
    if (!projectId || !axios.isAxiosError(currentProjectError)) return;
    if (currentProjectError.response?.status !== 404) return;

    void (async () => {
      await queryClient.cancelQueries({ queryKey: ["recent-projects"] });
      queryClient.setQueryData<RecentProject[]>(["recent-projects"], (projects) =>
        projects?.filter((project) => project.projectId !== projectId),
      );
      await removeRecentProjectByProjectId(projectId);
      toast.error(t("projects.projectUnavailable"));
      navigate("/", { replace: true });
    })();
  }, [currentProjectError, navigate, projectId, queryClient, t]);

  useEffect(() => {
    if (!currentProject || lastOpenedProjectIdRef.current === currentProject.id) return;

    lastOpenedProjectIdRef.current = currentProject.id;
    let isDiscarded = false;

    void openRecentProject(currentProject.id, currentProject.title).then((nextProjects) => {
      if (!nextProjects || isDiscarded || lastOpenedProjectIdRef.current !== currentProject.id)
        return;

      queryClient.setQueryData<RecentProject[]>(["recent-projects"], nextProjects);
    });

    return () => {
      isDiscarded = true;
    };
  }, [currentProject, queryClient]);

  const pathname = location.pathname;

  /** 常驻顶部：项目库 */
  const primaryNavItems = useMemo<AppSidebarNavItem[]>(
    () => [
      {
        label: t("topbar.projects"),
        href: "/",
        icon: LibraryBig,
        active: pathname === "/",
      },
    ],
    [pathname, t],
  );

  /**
   * 项目内才出现的三项。世界观与角色属于某个项目，项目库、仪表盘、提示词链
   * 这些全局页面没有当前项目，一律不显示。
   * 「创作」放在最前，否则进入项目后没有回到写作区的入口。
   */
  const projectNavItems = useMemo<AppSidebarNavItem[]>(() => {
    if (!projectId) return [];
    return [
      {
        label: t("topbar.creation"),
        href: `/projects/${projectId}`,
        icon: PenLine,
        // 精确匹配：写作页就是 /projects/:id 本身，不能让子页面也命中
        active: pathname === `/projects/${projectId}`,
      },
      {
        label: t("topbar.workspace"),
        href: `/projects/${projectId}/world-info`,
        icon: Globe,
        active: pathname.endsWith("/world-info"),
      },
      {
        label: t("topbar.characters"),
        href: `/projects/${projectId}/characters`,
        icon: UserRound,
        active: pathname.endsWith("/characters"),
      },
    ];
  }, [pathname, projectId, t]);

  /** 底部工具区：与项目无关的全局页面，紧贴语言/主题/设置上方 */
  const utilityNavItems = useMemo<AppSidebarNavItem[]>(
    () => [
      {
        label: t("topbar.promptChains"),
        href: "/prompt-chains",
        icon: Workflow,
        active: pathname.startsWith("/prompt-chains"),
      },
      {
        label: t("dashboard.title"),
        href: "/dashboard",
        icon: ChartNoAxesCombined,
        active: pathname.startsWith("/dashboard"),
      },
    ],
    [pathname, t],
  );

  const handleLanguageChange = async (language: string) => {
    const nextLanguage = language as LanguageCode;
    i18n.changeLanguage(nextLanguage);
    saveLanguagePreference(nextLanguage);

    try {
      await apiClient.put("/settings", { language: nextLanguage });
    } catch (error) {
      console.error("Failed to sync language setting to server:", error);
    }
  };

  const handleThemeToggle = useCallback(() => {
    setShouldAnimateTheme(true);
    onToggleTheme();
  }, [onToggleTheme]);

  const toggleExpanded = useCallback(() => {
    if (isMobile) {
      closeSidebar();
      return;
    }

    setIsExpanded((prev) => !prev);
  }, [closeSidebar, isMobile]);

  // 折叠按钮已移到桌面壳的标题栏，通过 preload 转发成页面事件。
  useEffect(() => {
    window.addEventListener("openfic:toggle-sidebar", toggleExpanded);
    return () => window.removeEventListener("openfic:toggle-sidebar", toggleExpanded);
  }, [toggleExpanded]);

  const handleOpenSettings = useCallback(() => {
    if (isMobile) {
      closeSidebar();
    }
    openSettings();
  }, [closeSidebar, isMobile, openSettings]);

  return (
    <>
      <AnimatePresence initial={false}>
        {isMobile && isSidebarOpen && (
          <motion.div
            {...mobileSidebarBackdropSwipeHandlers}
            key="mobile-sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: "var(--app-status-bar-height)",
              background: "rgba(0, 0, 0, 0.36)",
              zIndex: 99,
            }}
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        <MotionBox
          {...mobileSidebarSwipeHandlers}
          className={isMobile ? "mobile-sidebar-sheet" : undefined}
          data-open={isMobile ? String(isSidebarOpen) : undefined}
          position="fixed"
          top="0"
          left="0"
          bottom="var(--app-status-bar-height)"
          initial={false}
          animate={!isMobile ? { width: sidebarWidth } : undefined}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: isMobile ? SIDEBAR_EXPANDED_WIDTH : undefined,
            borderRight: "1px solid var(--gray-a5)",
            background: "color-mix(in srgb, var(--color-background) 92%, transparent)",
            backdropFilter: "blur(12px)",
            zIndex: 100,
            overflow: "hidden",
            boxShadow: isMobile ? "var(--shadow-5)" : undefined,
            clipPath: isMobile ? "inset(0 -64px 0 0)" : undefined,
          }}
        >
          <Flex
            direction="column"
            height="100%"
            p="3"
          >
            {/* 品牌区在桌面壳标题栏；侧边栏首项仍是项目库入口 */}
            <SidebarNav
              items={primaryNavItems}
              isExpanded={isMobile || isExpanded}
            />

            <AnimatePresence initial={false}>
              {projectNavItems.length > 0 ? (
                <MotionBox
                  key="project-nav"
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -4 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                  style={{ width: "100%", overflow: "hidden" }}
                >
                  <SidebarNav
                    items={projectNavItems}
                    isExpanded={isMobile || isExpanded}
                  />
                </MotionBox>
              ) : null}
            </AnimatePresence>

            <MotionFlex
              layout
              mt="auto"
              direction={isMobile || isExpanded ? "row" : "column"}
              align="center"
              justify={isMobile || isExpanded ? "end" : "center"}
              gap={isMobile || isExpanded ? "0" : "1"}
              width="100%"
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* 全局页面入口：展开时收成一排图标，和语言/主题/设置并排贴底 */}
              <SidebarNav
                items={utilityNavItems}
                isExpanded={false}
                direction={isMobile || isExpanded ? "row" : "column"}
              />
                <SidebarActions
                  appearance={appearance}
                  themeMode={themeMode}
                  isExpanded={isMobile || isExpanded}
                  shouldAnimateTheme={shouldAnimateTheme}
                  languageLabel={t("topbar.language")}
                  settingsLabel={t("topbar.settings")}
                  toggleThemeLabel={t("topbar.toggleTheme")}
                  themeTooltip={
                    themeMode === "system"
                      ? t("topbar.toggleLightMode")
                      : themeMode === "light"
                        ? t("topbar.toggleDarkMode")
                        : t("topbar.toggleSystemMode")
                  }
                  languages={supportedLanguages.map((lang) => ({
                    code: lang.code,
                    name: lang.name,
                  }))}
                  currentLanguage={i18n.language}
                  onLanguageChange={handleLanguageChange}
                  onToggleTheme={handleThemeToggle}
                  onOpenSettings={handleOpenSettings}
                />
            </MotionFlex>
          </Flex>
        </MotionBox>
      </AnimatePresence>
    </>
  );
}
