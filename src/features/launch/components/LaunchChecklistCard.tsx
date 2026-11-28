import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { nextSteps } from "@/features/launch/lib/launch-steps";
import { LaunchStepRow } from "@/features/launch/components/LaunchStepRow";
import type { LaunchChecklist } from "@/features/launch/hooks/use-launch-checklist";

/**
 * The launch checklist on the dashboard: how far the store is, the next steps (three at most),
 * and a way to every step in Settings. The same steps and count as the Settings page's list.
 */
export function LaunchChecklistCard({
  checklist,
  lang,
  slug,
  mayOpenSettings,
}: {
  checklist: LaunchChecklist;
  lang: "ar" | "en";
  slug: string;
  /** Every step is listed in Settings; a member who may not open it sees the next steps only. */
  mayOpenSettings: boolean;
}) {
  const ar = lang === "ar";
  const navigate = useNavigate();
  const { completed, total, steps, milestones } = checklist;
  const next = nextSteps(steps);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 100;

  return (
    <Card className="space-y-4 rounded-2xl border border-primary/25 bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-4.5 w-4.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground sm:text-base">
              {ar ? "خطوات إطلاق المتجر" : "Launch checklist"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {ar ? `مكتمل ${completed} من ${total}` : `${completed} of ${total} done`}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={milestones.handleDismissOnboarding}
          className="h-8 shrink-0 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {ar ? "إخفاء" : "Dismiss"}
        </Button>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={ar ? "تقدّم الإطلاق" : "Launch progress"}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-(--motion-very-slow)"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {ar ? "الخطوات التالية" : "Next steps"}
        </p>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {next.map((step) => (
            <LaunchStepRow
              key={step.id}
              step={step}
              lang={lang}
              slug={slug}
              milestones={milestones}
            />
          ))}
        </div>
      </div>

      {mayOpenSettings && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() =>
              void navigate({
                href: `/admin/b/${encodeURIComponent(slug)}/settings?checklist=open`,
              })
            }
            className="h-auto gap-1 p-0 text-xs font-semibold"
          >
            {ar ? `كل الخطوات (${total})` : `All ${total} steps`}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
          </Button>
        </div>
      )}
    </Card>
  );
}
