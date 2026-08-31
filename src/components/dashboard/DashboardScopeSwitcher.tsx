import { CalendarDays, TrendingUp, ShieldAlert, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardViewScope = "financials" | "diagnostics" | "sales_series";

interface DashboardScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: DashboardViewScope;
  onScopeChange: (scope: DashboardViewScope) => void;
  lowStockCount: number;
}

export function DashboardScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  lowStockCount,
}: DashboardScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: DashboardViewScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
    shortLabelAr: string;
    shortLabelEn: string;
    badge?: number;
  }[] = [
    {
      id: "financials",
      icon: TrendingUp,
      labelAr: "الملخص المالي",
      labelEn: "Financial Overview (30 Days)",
      shortLabelAr: "الملخص",
      shortLabelEn: "Summary",
    },
    {
      id: "sales_series",
      icon: CalendarDays,
      labelAr: "المبيعات اليومية",
      labelEn: "Daily Sales Chart",
      shortLabelAr: "المبيعات",
      shortLabelEn: "Sales",
    },
    {
      id: "diagnostics",
      icon: ShieldAlert,
      labelAr: "تنبيهات تحتاج متابعة",
      labelEn: "Stock & Customer Alerts",
      shortLabelAr: "التنبيهات",
      shortLabelEn: "Alerts",
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-3 items-stretch gap-1 p-1 bg-muted/40 border border-border rounded-2xl sm:flex sm:items-center sm:gap-1.5 sm:overflow-x-auto scrollbar-none">
      {scopes.map((scope) => {
        const Icon = scope.icon;
        const isActive = activeScope === scope.id;

        return (
          <button
            key={scope.id}
            type="button"
            onClick={() => onScopeChange(scope.id)}
            className={cn(
              "min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all duration-200 cursor-pointer sm:justify-start sm:gap-1.5 sm:px-3 sm:text-xs sm:shrink-0",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden truncate">
              {isAr ? scope.shortLabelAr : scope.shortLabelEn}
            </span>
            <span className="hidden sm:inline">{isAr ? scope.labelAr : scope.labelEn}</span>
            {scope.badge !== undefined && (
              <span
                className={cn(
                  "ms-1 px-1.5 py-0.2 text-[10px] font-extrabold rounded-full",
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : "bg-amber-500/20 text-amber-700 dark:text-amber-400",
                )}
              >
                {scope.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
