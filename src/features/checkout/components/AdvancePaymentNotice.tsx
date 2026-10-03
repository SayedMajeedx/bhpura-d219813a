import { Wallet } from "lucide-react";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { advanceLines, type AdvanceSplit } from "@/lib/payments/advance-payment";

/**
 * What the store's advance-payment rule asks of this order: the share to pay now
 * and the balance that stays due on delivery or at the event. Nothing when the
 * rule does not reach the order.
 */
export function AdvancePaymentNotice({
  split,
  currency,
  appointment = false,
  className,
}: {
  split: AdvanceSplit;
  currency: string;
  /** A booking's balance is due on the day of the event, not on delivery. */
  appointment?: boolean;
  className?: string;
}) {
  const { lang } = useStorefront();
  const lines = advanceLines(split, {
    isAr: lang === "ar",
    money: (n) => formatPrice(n, currency, lang),
    balanceWhen: appointment ? "event" : "delivery",
  });
  if (lines.length === 0) return null;
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm ${className ?? ""}`}
      role="note"
    >
      <Wallet className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="space-y-0.5">
        {lines.map((line, index) => (
          <p
            key={line}
            className={index === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
