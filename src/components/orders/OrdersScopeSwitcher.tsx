import React from "react";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK, segmentCount, segmentTab } from "@/components/ui/segmented";
import type { LucideIcon } from "lucide-react";

export interface ScopeTab {
  id: string;
  label_en: string;
  label_ar: string;
  count: number;
  icon: LucideIcon;
  /** Orders are waiting on the team here: the tab and its count are drawn in the warning colour while it is not open. */
  urgent?: boolean;
}

interface OrdersScopeSwitcherProps {
  lang: "en" | "ar";
  tabs: readonly ScopeTab[] | ScopeTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const OrdersScopeSwitcher: React.FC<OrdersScopeSwitcherProps> = ({
  lang,
  tabs,
  activeTab,
  onTabChange,
}) => {
  const isAr = lang === "ar";

  const renderTab = (tab: ScopeTab) => {
    const isActive = activeTab === tab.id;
    const label = isAr ? tab.label_ar : tab.label_en;
    const TabIcon = tab.icon;

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        aria-pressed={isActive}
        className={segmentTab(isActive, tab.urgent)}
      >
        <TabIcon className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
        <span className={segmentCount(isActive, tab.urgent)}>{tab.count}</span>
      </button>
    );
  };

  // One row that scrolls sideways, on a phone too: a phone once had two tabs in a grid (their
  // labels cut, "يحتاج متا…") and the rest in a menu that hid which one was showing.
  return (
    <div role="group" aria-label={isAr ? "حالات الطلبات" : "Order views"} className={SEGMENT_TRACK}>
      {/* The chosen view's fill slides to the next one (transitions.dev's tabs sliding). */}
      <TabsPill />
      {tabs.map((tab) => renderTab(tab))}
    </div>
  );
};
