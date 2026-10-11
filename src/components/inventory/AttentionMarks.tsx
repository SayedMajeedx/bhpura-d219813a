import type { AttentionReason } from "@/features/inventory/lib/attention";

const TONE: Record<AttentionReason["tone"], string> = {
  danger: "bg-destructive/10 text-destructive border border-destructive/20",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
  info: "bg-muted text-muted-foreground border border-border-subtle",
};

/** A product's issues as small marks under its name: the same on the desktop row and the phone card. */
export function AttentionMarks({
  reasons,
  lang,
  className = "",
}: {
  reasons: AttentionReason[];
  lang: "ar" | "en";
  className?: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {reasons.map((reason) => (
        <span
          key={reason.key}
          className={`inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded ${TONE[reason.tone]}`}
        >
          {lang === "ar" ? reason.label_ar : reason.label_en}
        </span>
      ))}
    </div>
  );
}
