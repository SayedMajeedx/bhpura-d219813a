import React from "react";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK, segmentCount, segmentTab } from "@/components/ui/segmented";
import type { LucideIcon } from "lucide-react";

export interface InventoryScopeTab {
  id: string;
  label_en: string;
  label_ar: string;
  count: number;
  icon: LucideIcon;
}

interface InventoryScopeSwitcherProps {
  lang: "en" | "ar";
  tabs: readonly InventoryScopeTab[] | InventoryScopeTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const InventoryScopeSwitcher: React.FC<InventoryScopeSwitcherProps> = ({
  lang,
  tabs,
  activeTab,
  onTabChange,
}) => {
  const isAr = lang === "ar";

  const renderTab = (tab: InventoryScopeTab) => {
    const isActive = activeTab === tab.id;
    const label = isAr ? tab.label_ar : tab.label_en;
    const TabIcon = tab.icon;

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        aria-pressed={isActive}
        className={segmentTab(isActive)}
      >
        <TabIcon className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
        <span className={segmentCount(isActive)}>{tab.count}</span>
      </button>
    );
  };

  // One row that scrolls sideways, as the orders' filters do: a phone had two tabs in a grid with
  // their labels cut ("جميع المنـ…", "يتطلب الانـ…") and the rest in a menu.
  return (
    <div
      role="group"
      aria-label={isAr ? "حالات المخزون" : "Inventory views"}
      className={SEGMENT_TRACK}
    >
      {/* The chosen view's fill slides to the next one (transitions.dev's tabs sliding). */}
      <TabsPill />
      {tabs.map((tab) => renderTab(tab))}
    </div>
  );
};
