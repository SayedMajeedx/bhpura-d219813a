import React from "react";
import { Star, Users, RefreshCw, UserPlus, AlertCircle } from "lucide-react";

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
    { id: "vip", labelEn: "VIP Segment", labelAr: "المميزون VIP", icon: Star, badgeStyle: "text-amber-600 dark:text-amber-400" },
    { id: "repeat", labelEn: "Repeat Buyers", labelAr: "المتكررون", icon: RefreshCw, badgeStyle: "text-emerald-600 dark:text-emerald-400" },
    { id: "new", labelEn: "New Buyers", labelAr: "العملاء الجدد", icon: UserPlus, badgeStyle: "text-blue-600 dark:text-blue-400" },
    { id: "churn", labelEn: "Churn Risk", labelAr: "العملاء الغائبون", icon: AlertCircle, badgeStyle: "text-rose-600 dark:text-rose-400" },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1 rounded-xl bg-muted/50 border border-border/50 no-scrollbar">
      {scopes.map((scope) => {
        const Icon = scope.icon;
        const isActive = currentScope === scope.id;
        const count = counts[scope.id] || 0;

        return (
          <button
            key={scope.id}
            onClick={() => onScopeChange(scope.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              isActive
                ? "bg-card text-foreground shadow-2xs border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${scope.badgeStyle || ""}`} />
            <span>{isAr ? scope.labelAr : scope.labelEn}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
