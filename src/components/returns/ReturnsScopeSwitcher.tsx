import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Inbox,
  Clock3,
  CheckCircle2,
  SearchCheck,
  CircleDollarSign,
  Archive,
  Sliders,
} from "lucide-react";

export type ReturnsScope =
  | "all"
  | "under_review"
  | "approved"
  | "inspecting"
  | "settled"
  | "completed"
  | "policies";

interface ReturnsScopeSwitcherProps {
  lang: "en" | "ar";
  activeScope: ReturnsScope;
  onScopeChange: (scope: ReturnsScope) => void;
  counts: {
    all: number;
    under_review: number;
    approved: number;
    inspecting: number;
    settled: number;
    completed: number;
  };
}

export function ReturnsScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  counts,
}: ReturnsScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: Array<{
    id: ReturnsScope;
    labelAr: string;
    labelEn: string;
    icon: any;
    count?: number;
    badgeClass?: string;
  }> = [
    {
      id: "all",
      labelAr: "جميع الطلبات",
      labelEn: "All Returns",
      icon: Inbox,
      count: counts.all,
    },
    {
      id: "under_review",
      labelAr: "بانتظار المراجعة",
      labelEn: "Under Review",
      icon: Clock3,
      count: counts.under_review,
      badgeClass: counts.under_review > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : undefined,
    },
    {
      id: "approved",
      labelAr: "مقبول / بانتظار الاستلام",
      labelEn: "Approved / Awaiting",
      icon: CheckCircle2,
      count: counts.approved,
      badgeClass: counts.approved > 0 ? "bg-purple-500/15 text-purple-700 dark:text-purple-300" : undefined,
    },
    {
      id: "inspecting",
      labelAr: "مستلم / قيد الفحص",
      labelEn: "Received & Inspecting",
      icon: SearchCheck,
      count: counts.inspecting,
      badgeClass: counts.inspecting > 0 ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" : undefined,
    },
    {
      id: "settled",
      labelAr: "تم الاسترداد / الاستبدال",
      labelEn: "Refunded & Exchanged",
      icon: CircleDollarSign,
      count: counts.settled,
    },
    {
      id: "completed",
      labelAr: "مكتملة ومؤرشفة",
      labelEn: "Completed",
      icon: Archive,
      count: counts.completed,
    },
    {
      id: "policies",
      labelAr: "سياسة البراند",
      labelEn: "Brand Policy",
      icon: Sliders,
    },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {scopes.map((s) => {
        const Icon = s.icon;
        const isActive = activeScope === s.id;
        const label = isAr ? s.labelAr : s.labelEn;

        return (
          <Button
            key={s.id}
            variant="ghost"
            size="sm"
            onClick={() => onScopeChange(s.id)}
            className={cn(
              "h-8 px-3 text-xs font-medium rounded-lg shrink-0 gap-1.5 transition-all border",
              isActive
                ? "bg-primary/10 text-primary border-primary/20 font-semibold shadow-2xs"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
            <span>{label}</span>
            {s.count !== undefined && s.count > 0 && (
              <span
                className={cn(
                  "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full",
                  s.badgeClass || (isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"),
                )}
              >
                {s.count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
