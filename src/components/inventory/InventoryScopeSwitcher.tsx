import React from "react";
import { cn } from "@/lib/utils";
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
        className={cn(
          "group inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all touch-manipulation focus:outline-hidden focus:ring-2 focus:ring-primary/40",
          "shrink-0",
          isActive
            ? "bg-primary text-primary-foreground shadow-2xs"
            : "border border-border-subtle bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <TabIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
        <span
          className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-extrabold tabular-nums",
            isActive ? "bg-primary-foreground/20" : "bg-muted",
          )}
        >
          {tab.count}
        </span>
      </button>
    );
  };

  // One row that scrolls sideways, as the orders' filters do: a phone had two tabs in a grid with
  // their labels cut ("جميع المنـ…", "يتطلب الانـ…") and the rest in a menu.
  return (
    <div
      role="group"
      aria-label={isAr ? "حالات المخزون" : "Inventory views"}
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar select-none"
    >
      {tabs.map((tab) => renderTab(tab))}
    </div>
  );
};
