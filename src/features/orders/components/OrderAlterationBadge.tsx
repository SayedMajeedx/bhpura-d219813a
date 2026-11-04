import { Scissors } from "lucide-react";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import { alterationsOut, type AlterationStatus } from "@/features/orders/lib/alterations";

/**
 * "Alteration out": a piece of the order is with the workshop for an alteration or a fix
 * (`order_alterations`, read with the orders list as `alterations`). Nothing when none is out.
 */
export function OrderAlterationBadge({
  order,
  lang,
  className,
}: {
  order: { alterations?: ReadonlyArray<{ status: string }> | null };
  lang: "ar" | "en";
  className?: string;
}) {
  const out = alterationsOut(
    (order.alterations ?? []).map((a) => ({ status: a.status as AlterationStatus })),
  );
  if (out === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-foreground",
        className,
      )}
    >
      <Scissors className="h-3 w-3 shrink-0" aria-hidden="true" />
      {lang === "ar"
        ? out === 1
          ? "تعديل عند الورشة"
          : `عند الورشة للتعديل: ${countOf(out, "piece", lang)}`
        : out === 1
          ? "Alteration out"
          : `${countOf(out, "piece", lang)} out for alteration`}
    </span>
  );
}
