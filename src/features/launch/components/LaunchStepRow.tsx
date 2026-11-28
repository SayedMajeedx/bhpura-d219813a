import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SettingsTabId } from "@/features/settings/registry";
import type { LaunchStep } from "@/features/launch/lib/launch-steps";
import type { LaunchChecklist } from "@/features/launch/hooks/use-launch-checklist";

/**
 * One step of the launch checklist, as the dashboard and the Settings page both draw it: what it
 * is, whether it is done, and the one button that does it (or reopens it once done). A step the
 * data cannot always see (the store shared, a first sale away from the system) can be marked
 * done by hand.
 */
export function LaunchStepRow({
  step,
  lang,
  slug,
  milestones,
  onNavigateTab,
}: {
  step: LaunchStep;
  lang: "ar" | "en";
  slug: string;
  milestones: LaunchChecklist["milestones"];
  /** On the Settings page, a setup step opens its group in place (no navigation, no prompt). */
  onNavigateTab?: (tab: SettingsTabId, groupAnchor?: string) => void;
}) {
  const ar = lang === "ar";
  const navigate = useNavigate();
  const Icon = step.icon;
  const done = step.isComplete;
  const label = done ? step.editLabel : step.actionLabel;
  const buttonClass = done
    ? "h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
    : "h-7 px-2.5 text-xs font-medium";
  const variant = done ? "ghost" : "outline";

  const openSetting = () => {
    if (!step.tabId) return;
    if (onNavigateTab) {
      onNavigateTab(step.tabId, step.group ? `group-${step.group}` : undefined);
      return;
    }
    const params = new URLSearchParams({ tab: step.tabId });
    if (step.group) params.set("group", step.group);
    void navigate({ href: `/admin/b/${encodeURIComponent(slug)}/settings?${params}` });
  };

  const action = step.external ? (
    <div className="flex items-center gap-1">
      <Button asChild variant={variant} size="sm" className={buttonClass}>
        <a
          href={step.external}
          target="_blank"
          rel="noopener noreferrer"
          onClick={milestones.handlePreviewStorefront}
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          {label}
        </a>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={milestones.handleCopyStoreLink}
        aria-label={ar ? "نسخ رابط المتجر" : "Copy store link"}
        title={ar ? "نسخ رابط المتجر" : "Copy store link"}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  ) : step.tabId ? (
    <Button type="button" variant={variant} size="sm" onClick={openSetting} className={buttonClass}>
      {label}
    </Button>
  ) : step.href ? (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={() => void navigate({ href: step.href! })}
      className={buttonClass}
    >
      {label}
      {!done && <ArrowRight className="h-2.5 w-2.5 rtl:rotate-180" aria-hidden />}
    </Button>
  ) : null;

  const markedByHand =
    step.manual === "previewed"
      ? milestones.isPreviewed
      : step.manual === "sale"
        ? milestones.isManualSaleCompleted
        : false;
  const toggleMark = () => {
    if (step.manual === "previewed") milestones.togglePreviewMilestone(!markedByHand);
    if (step.manual === "sale") milestones.toggleSaleMilestone(!markedByHand);
  };
  // Marked by hand can be taken back; done by the data (orders came in) cannot.
  const showMark = step.manual && (!done || markedByHand);

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
        done
          ? "border-success/20 bg-success/[0.03]"
          : "border-border-subtle bg-muted/20 hover:border-primary/40"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <span className="block break-words text-xs font-medium text-foreground">
            {step.title}
          </span>
          <span className="block break-words text-xs font-normal leading-normal text-muted-foreground">
            {step.description}
          </span>
          {showMark && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={toggleMark}
              className="h-auto p-0 text-xs font-normal text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              {markedByHand
                ? ar
                  ? "لم يكتمل بعد"
                  : "Mark as not done"
                : ar
                  ? "تم، حدّده كمكتمل"
                  : "Done, mark it"}
            </Button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {done && (
          <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">
            {ar ? "مكتمل" : "Done"}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}
