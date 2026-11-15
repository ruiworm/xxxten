import { Badge, Flex, Text } from "@radix-ui/themes";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  isAdvancedCategory,
  SETTINGS_ADVANCED_CATEGORIES,
  SETTINGS_BASIC_CATEGORIES,
  type SettingsCategory,
} from "../lib/settings-categories";

/** 设置类目 */
interface SettingsSidebarProps {
  /** 当前选中的类目 */
  activeCategory: SettingsCategory;
  /** 类目变更回调 */
  onCategoryChange: (category: SettingsCategory) => void;
}

function SettingsCategoryButton({
  category,
  isActive,
  onSelect,
}: {
  category: (typeof SETTINGS_BASIC_CATEGORIES)[number];
  isActive: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`settings-sidebar-item${isActive ? " settings-sidebar-item--active" : ""}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className="settings-sidebar-item-icon"
        aria-hidden="true"
      >
        {category.icon}
      </span>
      <Flex
        align="center"
        gap="2"
        className="settings-sidebar-item-label"
      >
        <Text
          size="2"
          weight={isActive ? "medium" : "regular"}
        >
          {t(category.labelKey)}
        </Text>
        {category.badgeKey ? (
          <Badge
            size="1"
            variant="soft"
            color="green"
          >
            {t(category.badgeKey)}
          </Badge>
        ) : null}
      </Flex>
    </button>
  );
}

export function SettingsSidebar({ activeCategory, onCategoryChange }: SettingsSidebarProps) {
  const { t } = useTranslation();
  // 高级设置默认收起；当前选中的项在高级里时自动展开，避免打开后看不到自己所在的分类。
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(() => isAdvancedCategory(activeCategory));

  useEffect(() => {
    if (isAdvancedCategory(activeCategory)) setIsAdvancedOpen(true);
  }, [activeCategory]);

  return (
    <nav
      className="settings-sidebar"
      aria-label={t("topbar.settings")}
    >
      <div className="settings-sidebar-list">
        {SETTINGS_BASIC_CATEGORIES.map((category) => (
          <SettingsCategoryButton
            key={category.id}
            category={category}
            isActive={activeCategory === category.id}
            onSelect={() => onCategoryChange(category.id)}
          />
        ))}

        <div className="settings-sidebar-group">
          <button
            type="button"
            className="settings-sidebar-group-toggle"
            aria-expanded={isAdvancedOpen}
            onClick={() => setIsAdvancedOpen((open) => !open)}
          >
            <Text
              size="1"
              color="gray"
            >
              {t("settings.advancedSection")}
            </Text>
            <ChevronDown
              size={14}
              className="settings-sidebar-group-chevron"
              data-open={isAdvancedOpen}
              aria-hidden="true"
            />
          </button>
          {isAdvancedOpen ? (
            <div
              className="settings-sidebar-group-items"
              role="group"
              aria-label={t("settings.advancedSection")}
            >
              {SETTINGS_ADVANCED_CATEGORIES.map((category) => (
                <SettingsCategoryButton
                  key={category.id}
                  category={category}
                  isActive={activeCategory === category.id}
                  onSelect={() => onCategoryChange(category.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
