import {
  Bell,
  Bot,
  Brain,
  Cable,
  Database,
  FileText,
  Globe,
  MessagesSquare,
  Package,
  Palette,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  Summary as SummaryIcon,
  Timer,
  Type,
} from "lucide-react";
import type { ReactNode } from "react";

export type SettingsCategory =
  | "general"
  | "editor"
  | "connections"
  | "models"
  | "notifications"
  | "personalization"
  | "index"
  | "session"
  | "context"
  | "summary"
  | "agent-tools"
  | "web-search"
  | "rules"
  | "skills"
  | "agents"
  | "advanced";

interface SettingsCategoryItem {
  id: SettingsCategory;
  icon: ReactNode;
  labelKey: string;
  badgeKey?: string;
}

/**
 * 普通设置：只放新用户必须碰、且不涉及技术概念的项。
 * 侧边栏直接平铺，不做分组标题。
 */
export const SETTINGS_BASIC_CATEGORIES: SettingsCategoryItem[] = [
  {
    id: "general",
    icon: <SettingsIcon size={16} />,
    labelKey: "settings.general",
  },
  {
    id: "editor",
    icon: <Type size={16} />,
    labelKey: "settings.editor",
  },
  {
    id: "connections",
    icon: <Cable size={16} />,
    labelKey: "settings.connections",
  },
  {
    id: "models",
    icon: <Brain size={16} />,
    labelKey: "settings.models",
  },
  {
    id: "notifications",
    icon: <Bell size={16} />,
    labelKey: "settings.notifications",
  },
];

/**
 * 高级设置：出现参数、阈值、检索、Agent 内部机制等概念的项全部收进这里，
 * 侧边栏默认折叠成一个「高级设置」入口。
 */
export const SETTINGS_ADVANCED_CATEGORIES: SettingsCategoryItem[] = [
  {
    id: "personalization",
    icon: <Palette size={16} />,
    labelKey: "settings.personalization",
  },
  {
    id: "index",
    icon: <Database size={16} />,
    labelKey: "settings.index",
  },
  {
    id: "session",
    icon: <Timer size={16} />,
    labelKey: "settings.session",
  },
  {
    id: "context",
    icon: <MessagesSquare size={16} />,
    labelKey: "settings.context",
  },
  {
    id: "summary",
    icon: <SummaryIcon size={16} />,
    labelKey: "settings.summary",
  },
  {
    id: "agent-tools",
    icon: <ShieldAlert size={16} />,
    labelKey: "settings.agentTools",
  },
  {
    id: "web-search",
    icon: <Globe size={16} />,
    labelKey: "settings.webSearch",
  },
  {
    id: "rules",
    icon: <FileText size={16} />,
    labelKey: "settings.rules",
  },
  {
    id: "skills",
    icon: <Package size={16} />,
    labelKey: "settings.skills",
  },
  {
    id: "agents",
    icon: <Bot size={16} />,
    labelKey: "settings.agents",
  },
  {
    id: "advanced",
    icon: <SlidersHorizontal size={16} />,
    labelKey: "settings.advanced",
  },
];

/** 全部类目，供移动端列表等顺序遍历的场景使用。 */
export const SETTINGS_CATEGORY_ITEMS: SettingsCategoryItem[] = [
  ...SETTINGS_BASIC_CATEGORIES,
  ...SETTINGS_ADVANCED_CATEGORIES,
];

const ADVANCED_CATEGORY_IDS = new Set<SettingsCategory>(
  SETTINGS_ADVANCED_CATEGORIES.map((category) => category.id),
);

export function isAdvancedCategory(category: SettingsCategory): boolean {
  return ADVANCED_CATEGORY_IDS.has(category);
}
