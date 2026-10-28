import { Hourglass } from "lucide-react";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import { orderWaiting } from "@/features/orders/lib/order-card";

type WaitingOrder = Parameters<typeof orderWaiting>[0];

/**
 * "Waiting 3 days": an open order that has sat on the team for two days or more, amber, and red
 * from five. Nothing for an order that is not waiting on the team.
 */
export function OrderWaitingBadge({
  order,
  lang,
  productionStages,
  className,
}: {
  order: WaitingOrder;
  lang: "ar" | "en";
  productionStages?: boolean;
  className?: string;
}) {
  const waiting = orderWaiting(order, { productionStages });
  if (!waiting) return null;
  const days = countOf(waiting.days, "day", lang);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold",
        waiting.late
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
        className,
      )}
    >
      <Hourglass className="h-3 w-3 shrink-0" aria-hidden="true" />
      {lang === "ar" ? `بانتظار الإجراء منذ ${days}` : `Waiting ${days}`}
    </span>
  );
}
