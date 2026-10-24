import React from "react";
import { Star, Users, RefreshCw, UserPlus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomerSegmentScope = "all" | "vip" | "repeat" | "new" | "churn";

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
      <button
        key={scope.id}
        type="button"
        aria-pressed={isActive}
        onClick={() => onScopeChange(scope.id)}
        className={cn(
          "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all cursor-pointer",
          "shrink-0",
          isActive
            ? "border border-border-strong bg-card text-foreground shadow-2xs"
            : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
        )}
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", scope.badgeStyle)} />
        <span className="whitespace-nowrap">{isAr ? scope.labelAr : scope.labelEn}</span>
        <span
          className={cn(
            "rounded-full px-1.5 text-xs font-extrabold",
            isActive ? "bg-primary/10 text-primary" : "bg-muted",
          )}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="hidden items-center gap-1.5 overflow-x-auto rounded-xl border border-border-subtle bg-muted/50 p-1 no-scrollbar sm:flex">
        {scopes.map((scope) => {
          return renderScope(scope);
        })}
      </div>
      {/* On a phone, one sideways row with whole labels, as the orders' filters: two halves and a
          menu cut the labels to "جميع العـ…" and hid three segments behind "…". */}
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar sm:hidden">
        {scopes.map((scope) => renderScope(scope))}
      </div>
    </>
  );
};
