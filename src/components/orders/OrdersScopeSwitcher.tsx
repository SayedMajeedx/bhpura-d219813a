import React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface ScopeTab {
  id: string;
  label_en: string;
  label_ar: string;
  count: number;
  icon: LucideIcon;
  /** Orders are waiting on the team here: the tab is drawn in amber while it is not open. */
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
        className={cn(
          "group inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all touch-manipulation focus:outline-hidden focus:ring-2 focus:ring-primary/40",
          "shrink-0",
          isActive
            ? "bg-primary text-primary-foreground shadow-2xs"
            : tab.urgent
              ? "border border-amber-500/40 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
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

  // One row that scrolls sideways, on a phone too: a phone once had two tabs in a grid (their
  // labels cut, "يحتاج متا…") and the rest in a menu that hid which one was showing.
  return (
    <div
      role="group"
      aria-label={isAr ? "حالات الطلبات" : "Order views"}
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar select-none"
    >
      {tabs.map((tab) => renderTab(tab))}
    </div>
  );
};
