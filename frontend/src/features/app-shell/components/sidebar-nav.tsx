import { Box, Flex, Text, Tooltip } from "@radix-ui/themes";
import { motion } from "motion/react";
import { Link } from "react-router";

import "./sidebar-nav.css";
import {
  SIDEBAR_ICON_SIZE,
  SIDEBAR_ITEM_HEIGHT,
  type AppSidebarNavItem,
} from "./app-sidebar.constants";

const MotionFlex = motion.create(Flex);

interface SidebarNavProps {
  items: AppSidebarNavItem[];
  isExpanded: boolean;
  /** 展开态可以把图标排成一行，塞进底部的工具条里 */
  direction?: "row" | "column";
}

function SidebarNavItem({
  item,
  isExpanded,
  inline,
}: {
  item: AppSidebarNavItem;
  isExpanded: boolean;
  inline: boolean;
}) {
  const Icon = item.icon;
  const content = (
    <MotionFlex
      align="center"
      className="app-sidebar-nav-item"
      data-active={item.active ? "true" : "false"}
      style={{
        display: "flex",
        alignItems: "center",
        height: SIDEBAR_ITEM_HEIGHT,
      }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      <Box
        className="app-sidebar-nav-item__icon-box"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: SIDEBAR_ITEM_HEIGHT,
          height: SIDEBAR_ITEM_HEIGHT,
          flexShrink: 0,
        }}
      >
        <Icon
          size={SIDEBAR_ICON_SIZE}
          color="currentColor"
          className="app-sidebar-nav-item__icon"
        />
      </Box>
      <motion.div
        initial={false}
        animate={{
          opacity: isExpanded ? 1 : 0,
          width: isExpanded ? 132 : 0,
        }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="app-sidebar-nav-item__label"
        style={{ pointerEvents: isExpanded ? "auto" : "none" }}
      >
        <Text
          size="2"
          weight={item.active ? "bold" : "medium"}
        >
          {item.label}
        </Text>
      </motion.div>
    </MotionFlex>
  );

  const linked = (
    <Link
      to={item.href}
      aria-label={item.label}
      aria-current={item.active ? "page" : undefined}
      className="app-sidebar-nav-link"
      style={{ display: "block", width: "100%" }}
    >
      {content}
    </Link>
  );

  return isExpanded ? (
    <Box
      key={item.href}
      width="100%"
    >
      {linked}
    </Box>
  ) : (
    <Tooltip
      key={item.href}
      content={item.label}
      side="right"
    >
      <Box width={inline ? "auto" : "100%"}>{linked}</Box>
    </Tooltip>
  );
}

export function SidebarNav({ items, isExpanded, direction = "column" }: SidebarNavProps) {
  const inline = direction === "row";

  return (
    <Flex
      direction={direction}
      align="center"
      gap={inline ? "0" : "1"}
      width={inline ? "auto" : "100%"}
      style={inline ? { flexShrink: 0 } : undefined}
    >
      {items.map((item) => (
        <SidebarNavItem
          key={item.href}
          item={item}
          isExpanded={isExpanded}
          inline={inline}
        />
      ))}
    </Flex>
  );
}
