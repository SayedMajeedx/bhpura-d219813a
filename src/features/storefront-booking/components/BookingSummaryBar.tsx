import { useEffect, useId, useState } from "react";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/storefront-context";
import { optionName } from "@/lib/bookings/service-options";
import { discountLabel } from "@/lib/bookings/discounts";
import { depositSentence } from "@/lib/bookings/deposit";
import { taxRateLabel, type TaxRule } from "@/lib/order-tax";
import { claimBottomBar, releaseBottomBar } from "@/lib/bottom-bar-store";
import { serviceName, type FlowStep } from "@/features/storefront-booking/lib/booking-flow";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";

const CLAIM = "booking-summary";

type Totals = { tax: number; added: boolean; total: number };

/** Where a step's card sits on the page, so the bar can take the customer to the one still to do. */
export const stepAnchor = (id: FlowStep) => `booking-step-${id}`;

/**
 * The booking's price and its next step, always within reach at the foot of the page: the total
 * and one button. The breakdown (services, add-ons, offer, travel, VAT, deposit) folds open from
 * the total; while a step is still to do the button names it and takes the customer there.
 * It holds the bottom slot (`claimBottomBar`) so the floating WhatsApp button rises above it.
 */
export function BookingSummaryBar({
  flow,
  totals,
  tax,
  offerAmount,
  stepLabel,
}: {
  flow: BookingFlow;
  totals: Totals;
  tax: TaxRule;
  offerAmount: number;
  /** The name of the step still to do, or null when the booking is complete. */
  stepLabel: string | null;
}) {
  const { isAr, currency, showPrices, chosen } = flow;
  const lang = isAr ? "ar" : "en";
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const priced = chosen.length > 0 && showPrices;
  const depositLine = depositSentence(flow.deposit, isAr);
  const paidOptions = flow.optionLines.filter((line) => line.price > 0);
  const travel = flow.flow.areaCode && flow.travelFee !== null && flow.travelFee > 0;
  const money = (amount: number) => formatPrice(amount, currency, lang);

  useEffect(() => {
    claimBottomBar(CLAIM);
    return () => releaseBottomBar(CLAIM);
  }, []);

  const goToStep = () => {
    if (!flow.step) return;
    document
      .getElementById(stepAnchor(flow.step))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const actionLabel = flow.submitting
    ? isAr
      ? "جارٍ الإرسال…"
      : "Sending…"
    : stepLabel
      ? isAr
        ? `أكمل: ${stepLabel}`
        : `Next: ${stepLabel}`
      : flow.catalog
        ? isAr
          ? "أرسل طلب الحجز"
          : "Send booking request"
        : isAr
          ? "تابع للدفع"
          : "Continue to checkout";

  return (
    <section
      aria-label={isAr ? "ملخص الحجز" : "Booking summary"}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 shadow-lg backdrop-blur"
    >
      <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
        {priced && (
          <div
            id={panelId}
            hidden={!open}
            className="mb-3 max-h-[40vh] space-y-1.5 overflow-y-auto border-b border-border pb-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-muted-foreground">
                {chosen.map((service) => serviceName(service, isAr)).join(isAr ? "، " : ", ")}
              </span>
              <span className="shrink-0 text-foreground" dir="ltr">
                {money(flow.servicesTotal)}
              </span>
            </div>
            {paidOptions.map((line) => (
              <div key={line.option.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words text-muted-foreground">
                  {optionName(line.option, isAr)}
                  {line.option.tiers ? ` × ${line.quantity}` : ""}
                </span>
                <span className="shrink-0 text-foreground" dir="ltr">
                  + {money(line.price)}
                </span>
              </div>
            ))}
            {travel && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {isAr ? `التنقل إلى ${flow.flow.area}` : `Travel to ${flow.flow.area}`}
                </span>
                <span className="text-foreground" dir="ltr">
                  {money(flow.travelFee ?? 0)}
                </span>
              </div>
            )}
            {flow.offer && (
              <div className="flex items-center justify-between gap-3 text-success">
                <span>{discountLabel(flow.offer, isAr)}</span>
                <span dir="ltr">− {money(offerAmount)}</span>
              </div>
            )}
            {totals.tax > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {totals.added
                    ? isAr
                      ? `ضريبة القيمة المضافة (${taxRateLabel(tax.rate)})`
                      : `VAT (${taxRateLabel(tax.rate)})`
                    : isAr
                      ? `يشمل ضريبة القيمة المضافة (${taxRateLabel(tax.rate)})`
                      : `Includes VAT (${taxRateLabel(tax.rate)})`}
                </span>
                <span className="text-foreground" dir="ltr">
                  {totals.added ? "+ " : ""}
                  {money(totals.tax)}
                </span>
              </div>
            )}
            {depositLine && <p className="pt-1 text-xs text-muted-foreground">{depositLine}</p>}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          {priced ? (
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-11 min-w-0 flex-col items-start gap-0 px-2 text-start"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                {isAr ? "الإجمالي" : "Total"}
                <ChevronUp
                  className={cn("size-3.5 transition-transform", !open && "rotate-180")}
                  aria-hidden="true"
                />
              </span>
              <span className="text-lg font-bold leading-tight text-foreground" dir="ltr">
                {money(totals.total)}
              </span>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">
              {isAr ? "اختر خدمة لترى السعر" : "Choose a service to see the price"}
            </span>
          )}
          <Button
            type="button"
            size="lg"
            className="min-w-0 flex-1 sm:flex-none sm:px-10"
            disabled={flow.submitting}
            onClick={stepLabel ? goToStep : flow.submit}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}
