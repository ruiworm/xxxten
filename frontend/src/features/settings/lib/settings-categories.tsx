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
  | "personalization"
  | "editor"
  | "notifications"
  | "connections"
  | "models"
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

export type SettingsCategoryGroup = "basics" | "model" | "writing" | "advanced";

interface SettingsCategoryItem {
  id: SettingsCategory;
  group: SettingsCategoryGroup;
  icon: ReactNode;
  labelKey: string;
  badgeKey?: string;
}

/** 分组顺序即侧边栏渲染顺序；分类顺序即组内顺序。 */
export const SETTINGS_CATEGORY_GROUPS: { id: SettingsCategoryGroup; labelKey: string }[] = [
  { id: "basics", labelKey: "settings.groups.basics" },
  { id: "model", labelKey: "settings.groups.model" },
  { id: "writing", labelKey: "settings.groups.writing" },
  { id: "advanced", labelKey: "settings.groups.advanced" },
];

export const SETTINGS_CATEGORY_ITEMS: SettingsCategoryItem[] = [
  {
    id: "general",
    group: "basics",
    icon: <SettingsIcon size={16} />,
    labelKey: "settings.general",
  },
  {
    id: "personalization",
    group: "basics",
    icon: <Palette size={16} />,
    labelKey: "settings.personalization",
  },
  {
    id: "editor",
    group: "basics",
    icon: <Type size={16} />,
    labelKey: "settings.editor",
  },
  {
    id: "notifications",
    group: "basics",
    icon: <Bell size={16} />,
    labelKey: "settings.notifications",
  },
  {
    id: "connections",
    group: "model",
    icon: <Cable size={16} />,
    labelKey: "settings.connections",
  },
  {
    id: "models",
    group: "model",
    icon: <Brain size={16} />,
    labelKey: "settings.models",
  },
  {
    id: "index",
    group: "model",
    icon: <Database size={16} />,
    labelKey: "settings.index",
  },
  {
    id: "session",
    group: "writing",
    icon: <Timer size={16} />,
    labelKey: "settings.session",
  },
  {
    id: "context",
    group: "writing",
    icon: <MessagesSquare size={16} />,
    labelKey: "settings.context",
  },
  {
    id: "summary",
    group: "writing",
    icon: <SummaryIcon size={16} />,
    labelKey: "settings.summary",
  },
  {
    id: "agent-tools",
    group: "writing",
    icon: <ShieldAlert size={16} />,
    labelKey: "settings.agentTools",
  },
  {
    id: "web-search",
    group: "writing",
    icon: <Globe size={16} />,
    labelKey: "settings.webSearch",
  },
  {
    id: "rules",
    group: "writing",
    icon: <FileText size={16} />,
    labelKey: "settings.rules",
  },
  {
    id: "skills",
    group: "writing",
    icon: <Package size={16} />,
    labelKey: "settings.skills",
  },
  {
    id: "agents",
    group: "writing",
    icon: <Bot size={16} />,
    labelKey: "settings.agents",
  },
  {
    id: "advanced",
    group: "advanced",
    icon: <SlidersHorizontal size={16} />,
    labelKey: "settings.advanced",
  },
];
