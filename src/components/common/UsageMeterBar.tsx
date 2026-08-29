// ==============================================================================
// BOUTQ OS: USAGE METER PROGRESS BAR COMPONENT
// ==============================================================================

import React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Infinity as InfinityIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface UsageMeterBarProps {
  labelEn: string;
  labelAr: string;
  currentUsage: number;
  limitValue: number; // -1 = unlimited
  isUnlimited: boolean;
  unitEn?: string;
  unitAr?: string;
  icon?: React.ElementType;
}

export function UsageMeterBar({
  labelEn,
  labelAr,
  currentUsage,
  limitValue,
  isUnlimited,
  unitEn = "",
  unitAr = "",
  icon: Icon,
}: UsageMeterBarProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const percent = isUnlimited
    ? 0
    : limitValue > 0
      ? Math.min(100, Math.round((currentUsage / limitValue) * 100))
      : currentUsage > 0
        ? 100
        : 0;

  const is80 = !isUnlimited && limitValue > 0 && percent >= 80 && percent < 100;
  const is100 = !isUnlimited && limitValue > 0 && percent >= 100;

  const statusColor = is100
    ? "bg-destructive text-destructive-foreground"
    : is80
      ? "bg-amber-500 text-white"
      : "bg-primary text-primary-foreground";

  const barTrackColor = is100
    ? "bg-destructive"
    : is80
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <div className="space-y-2 p-3.5 rounded-2xl border border-border/80 bg-card/60 shadow-sm transition-all hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="p-1.5 rounded-lg bg-muted text-foreground/80">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <span className="text-xs font-bold text-foreground">
            {isAr ? labelAr : labelEn}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isUnlimited ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <InfinityIcon className="h-3 w-3" />
              <span>{isAr ? "غير محدود" : "Unlimited"}</span>
            </span>
          ) : (
            <span className="text-xs font-mono font-bold text-foreground">
              {currentUsage.toLocaleString()} / {limitValue.toLocaleString()}{" "}
              <span className="text-[10px] text-muted-foreground font-normal">
                {isAr ? unitAr : unitEn}
              </span>
            </span>
          )}

          {is100 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-destructive/10 text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span>100%</span>
            </span>
          )}
          {is80 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3 w-3" />
              <span>80%+</span>
            </span>
          )}
        </div>
      </div>

      {!isUnlimited && (
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full transition-all duration-500 rounded-full", barTrackColor)}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-muted-foreground">
            <span>
              {is100
                ? isAr
                  ? "تم بلوغ الحد الأقصى"
                  : "Quota exceeded"
                : is80
                  ? isAr
                    ? "اقتربت من استهلاك الحد"
                    : "Approaching quota limit"
                  : isAr
                    ? "استهلاك طبيعي"
                    : "Normal usage"}
            </span>
            <span className="font-mono">{percent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
