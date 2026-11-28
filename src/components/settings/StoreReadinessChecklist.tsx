import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import type { SettingsTabId } from "@/features/settings/registry";
import { readinessFoldKey, readinessFolded } from "@/features/settings/lib/readiness-fold";
import { useLaunchChecklist } from "@/features/launch/hooks/use-launch-checklist";
import { LaunchStepRow } from "@/features/launch/components/LaunchStepRow";

// The setup steps' rules live with the launch checklist; screens and tests read them here too.
export {
  evaluateStoreReadiness,
  type BusinessSettingsData,
  type ReadinessEvaluationInput,
  type ReadinessItem,
} from "@/features/launch/lib/setup-steps";

interface StoreReadinessChecklistProps {
  brandId: string;
  slug: string;
  lang: "ar" | "en";
  logoUrl?: string | null;
  brandPalette?: unknown;
  storeVertical?: string | null;
  onNavigateTab: (tab: SettingsTabId, groupAnchor?: string) => void;
}

/**
 * The store's launch checklist above the settings: the same steps and the same count as the
 * dashboard's (`useLaunchChecklist`), every one listed, folded to one line once half are done.
 */
export function StoreReadinessChecklist({
  brandId,
  slug,
  lang,
  logoUrl,
  brandPalette,
  storeVertical,
  onNavigateTab,
}: StoreReadinessChecklistProps) {
  const isAr = lang === "ar";
  const checklist = useLaunchChecklist({
    brandId,
    slug,
    lang,
    logoUrl,
    brandPalette,
    storeVertical,
  });
  const { steps, completed: completedCount, total: totalCount } = checklist;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;
  const isAllComplete = completedCount === totalCount;

  // Folded to one line once half the steps are done, unless the merchant chose.
  const collapseStorageKey = readinessFoldKey(brandId);
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() => {
    try {
      if (typeof window !== "undefined") {
        // The dashboard's "All steps" opens the list whatever was chosen before.
        if (new URLSearchParams(window.location.search).get("checklist") === "open") return false;
        const saved = localStorage.getItem(collapseStorageKey);
        if (saved !== null) return saved === "true";
      }
    } catch {
      // ignore
    }
    return null;
  });
  const collapsed = readinessFolded({
    completed: completedCount,
    total: totalCount,
    choice: userCollapsed,
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setUserCollapsed(next);
    try {
      localStorage.setItem(collapseStorageKey, String(next));
    } catch {
      // ignore
    }
  };

  // Dismissed once every step is done; it comes back if a step stops being done.
  const storageKey = `store-readiness-dismissed-${brandId}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem(storageKey) === "true";
      }
    } catch {
      // ignore
    }
    return false;
  });

  useEffect(() => {
    if (!checklist.ready) return;
    if (!isAllComplete && dismissed) {
      setDismissed(false);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  }, [checklist.ready, isAllComplete, dismissed, storageKey]);

  if (isAllComplete && dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`rounded-xl border border-border bg-card shadow-xs transition ${
        collapsed ? "p-3 sm:p-3.5" : "p-4 sm:p-5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              isAllComplete
                ? "bg-success/10 text-success ring-1 ring-success/20"
                : "bg-primary/10 text-primary"
            }`}
          >
            {isAllComplete ? (
              <CheckCircle2 className="h-4.5 w-4.5" />
            ) : (
              <Sparkles className="h-4.5 w-4.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                {isAr ? "خطوات إطلاق المتجر" : "Launch checklist"}
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  isAllComplete ? "bg-success/15 text-success" : "bg-warning/15 text-foreground"
                }`}
              >
                {collapsed
                  ? `${completedCount} / ${totalCount}`
                  : `${completedCount} / ${totalCount} ${isAr ? "مكتمل" : "done"} (${progressPercent}%)`}
              </span>
            </div>
            <p
              className={`mt-0.5 text-xs font-normal leading-relaxed text-muted-foreground ${
                collapsed ? "hidden" : ""
              }`}
            >
              {isAllComplete
                ? isAr
                  ? "أنجزت كل خطوات الإطلاق. متجرك جاهز لعملائك."
                  : "Every launch step is done. Your store is ready for customers."
                : isAr
                  ? "ما يحتاجه متجرك ليفتح لعملائه، ثم أول طلب. هي الخطوات نفسها في لوحة التحكم."
                  : "What your store needs to open, then its first order. The dashboard shows the same steps."}
            </p>
          </div>
        </div>

        {/* The store's preview is in the page heading; this row only opens and folds the list. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            aria-label={
              collapsed
                ? isAr
                  ? "إظهار التفاصيل"
                  : "Show details"
                : isAr
                  ? "إخفاء التفاصيل"
                  : "Hide details"
            }
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>

          {isAllComplete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title={isAr ? "إخفاء التنبيه نهائياً" : "Dismiss readiness card"}
              aria-label={isAr ? "إخفاء التنبيه نهائياً" : "Dismiss readiness card"}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-[width] duration-(--motion-very-slow) ${
              isAllComplete ? "bg-success" : "bg-primary"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {!collapsed && (
        <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-border-subtle pt-2 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((step) => (
            <LaunchStepRow
              key={step.id}
              step={step}
              lang={lang}
              slug={slug}
              milestones={checklist.milestones}
              onNavigateTab={onNavigateTab}
            />
          ))}
        </div>
      )}
    </div>
  );
}
