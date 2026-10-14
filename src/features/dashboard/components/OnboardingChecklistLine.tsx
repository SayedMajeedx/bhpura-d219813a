import { CheckCircle2, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The launch checklist folded to one line once most of it is done: how far, and a tap to open it. */
export function OnboardingChecklistLine({
  completed,
  total = 3,
  isAr,
  onOpen,
}: {
  completed: number;
  total?: number;
  isAr: boolean;
  onOpen: () => void;
}) {
  const done = completed >= total;
  const Icon = done ? CheckCircle2 : Sparkles;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onOpen}
      aria-expanded={false}
      className="h-auto w-full justify-between gap-3 rounded-xl border-border-subtle bg-card px-3.5 py-2.5 text-start font-normal"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 ${done ? "text-emerald-600" : "text-primary"}`} />
        <span className="min-w-0 break-words text-xs font-semibold text-foreground">
          {done
            ? isAr
              ? "اكتملت خطوات إطلاق المتجر"
              : "Launch checklist complete"
            : isAr
              ? `خطوات إطلاق المتجر: ${completed} من ${total}`
              : `Launch checklist: ${completed} of ${total}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
        {isAr ? "عرض" : "Show"}
        <ChevronDown className="h-3.5 w-3.5" />
      </span>
    </Button>
  );
}
