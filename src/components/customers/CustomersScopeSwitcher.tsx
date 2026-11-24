import { SegmentTab } from "@/components/ui/segment-tab";
import React from "react";
import { Star, Users, RefreshCw, UserPlus, UserMinus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK, segmentCount } from "@/components/ui/segmented";

export type CustomerSegmentScope = "all" | "vip" | "repeat" | "new" | "one_time" | "churn";

interface CustomersScopeSwitcherProps {
  lang: "en" | "ar";
  currentScope: CustomerSegmentScope;
  onScopeChange: (scope: CustomerSegmentScope) => void;
  counts: Record<CustomerSegmentScope, number>;
}

export const CustomersScopeSwitcher: React.FC<CustomersScopeSwitcherProps> = ({
  lang,
  currentScope,
  onScopeChange,
  counts,
}) => {
  const isAr = lang === "ar";

  const scopes: Array<{
    id: CustomerSegmentScope;
    labelEn: string;
    labelAr: string;
    icon: React.ElementType;
    badgeStyle?: string;
  }> = [
    { id: "all", labelEn: "All Customers", labelAr: "جميع العملاء", icon: Users },
    {
      id: "vip",
      labelEn: "VIP Segment",
      labelAr: "المميزون VIP",
      icon: Star,
      badgeStyle: "text-amber-600 dark:text-amber-400",
    },
    {
      id: "repeat",
      labelEn: "Repeat Buyers",
      labelAr: "المتكررون",
      icon: RefreshCw,
      badgeStyle: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "new",
      labelEn: "New Buyers",
      labelAr: "العملاء الجدد",
      icon: UserPlus,
      badgeStyle: "text-blue-600 dark:text-blue-400",
    },
    {
      id: "one_time",
      labelEn: "One-time Buyers",
      labelAr: "اشتروا مرة واحدة",
      icon: UserMinus,
      badgeStyle: "text-muted-foreground",
    },
    {
      id: "churn",
      labelEn: "Churn Risk",
      labelAr: "العملاء الغائبون",
      icon: AlertCircle,
      badgeStyle: "text-rose-600 dark:text-rose-400",
    },
  ];

  const renderScope = (scope: (typeof scopes)[number]) => {
    const Icon = scope.icon;
    const isActive = currentScope === scope.id;
    const count = counts[scope.id] || 0;

    return (
      <SegmentTab
        active={isActive}
        key={scope.id}
        aria-pressed={isActive}
        onClick={() => onScopeChange(scope.id)}
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", scope.badgeStyle)} />
        <span>{isAr ? scope.labelAr : scope.labelEn}</span>
        <span className={segmentCount(isActive)}>{count}</span>
      </SegmentTab>
    );
  };

  return (
    // One row on every width, scrolling sideways when it does not fit, with whole labels: two
    // halves and a menu once cut a phone's labels to "جميع العـ…" and hid three behind "…".
    <div
      role="group"
      aria-label={isAr ? "شرائح العملاء" : "Customer groups"}
      className={SEGMENT_TRACK}
    >
      <TabsPill />
      {scopes.map((scope) => renderScope(scope))}
    </div>
  );
};
