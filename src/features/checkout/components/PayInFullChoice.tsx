import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import type { AdvanceSplit } from "@/lib/payments/advance-payment";
import { cn } from "@/lib/utils";

/**
 * Under an advance payment: the shopper pays the advance now and the rest later, or pays the
 * whole total now and has nothing left to pay. Shown only when the store allows it and the
 * advance really leaves a balance.
 */
export function PayInFullChoice({
  base,
  full,
  payInFull,
  onChange,
  currency,
  appointment = false,
}: {
  /** What the advance asks. */
  base: AdvanceSplit;
  /** What paying everything asks. */
  full: AdvanceSplit;
  payInFull: boolean;
  onChange: (payInFull: boolean) => void;
  currency: string;
  appointment?: boolean;
}) {
  const { lang, t } = useStorefront();
  const money = (n: number) => formatPrice(n, currency, lang);
  const options = [
    {
      value: false,
      title: t("ادفع الدفعة المقدمة الآن", "Pay the advance now"),
      detail: t(
        `${money(base.dueNow)} الآن، والباقي ${money(base.balance)} ${appointment ? "يوم المناسبة" : "عند الاستلام"}`,
        `${money(base.dueNow)} now, ${money(base.balance)} ${appointment ? "on the day" : "on delivery"}`,
      ),
    },
    {
      value: true,
      title: t("ادفع المبلغ كاملاً الآن", "Pay the full amount now"),
      detail: t(
        `${money(full.dueNow)} الآن، ولا يبقى شيء للدفع لاحقاً`,
        `${money(full.dueNow)} now, nothing left to pay later`,
      ),
    },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("طريقة سداد المبلغ", "How much to pay now")}
      className="grid gap-2"
    >
      {options.map((option) => {
        const active = payInFull === option.value;
        return (
          <Button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            variant="outline"
            onClick={() => onChange(option.value)}
            className={cn(
              "h-auto min-h-11 flex-col items-start gap-0.5 whitespace-normal rounded-lg p-3 text-start font-normal",
              active && "border-primary bg-primary/10 ring-1 ring-primary/40",
            )}
          >
            <span className="text-sm font-semibold text-foreground">{option.title}</span>
            <span className="text-xs text-muted-foreground">{option.detail}</span>
          </Button>
        );
      })}
    </div>
  );
}
