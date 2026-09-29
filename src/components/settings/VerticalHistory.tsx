import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, History } from "lucide-react";
import { normalizeVertical, VERTICAL_LABELS } from "@/lib/store-profile";
import { verticalQueries } from "@/lib/data/verticals";

/** The store's vertical changes: when, from what to what, and why. */
export function VerticalHistory({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const { data: changes = [] } = useQuery(verticalQueries.history(brandId));
  if (changes.length === 0) return null;
  const lang = isAr ? "ar" : "en";
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const when = (iso: string) =>
    new Intl.DateTimeFormat(isAr ? "ar-u-nu-latn" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));

  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <h3
        id="vertical-history-label"
        className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
      >
        <History className="size-3.5 text-primary" aria-hidden="true" />
        {isAr ? "سجل تغيير النشاط" : "Vertical history"}
      </h3>
      <ul aria-labelledby="vertical-history-label" className="space-y-2">
        {changes.map((change) => (
          <li key={change.id} className="text-xs">
            <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
              <span>{VERTICAL_LABELS[normalizeVertical(change.from_vertical)][lang]}</span>
              <Arrow className="size-3" aria-hidden="true" />
              <span>{VERTICAL_LABELS[normalizeVertical(change.to_vertical)][lang]}</span>
              <span className="font-normal text-muted-foreground">· {when(change.created_at)}</span>
            </p>
            <p className="text-muted-foreground">{change.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
