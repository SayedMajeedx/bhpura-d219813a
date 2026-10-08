import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, X } from "lucide-react";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";
import type { usePlaceOrder } from "@/features/checkout/hooks/use-place-order";
import { PAYMENT_METHODS_SECTION_ID } from "@/features/checkout/components/PaymentMethodCard";

/** How long the focus is kept on a method while the list is still settling. */
const FOCUS_WATCH_MS = 2000;

function firstOtherMethod(section: HTMLElement) {
  return (
    section.querySelector<HTMLElement>('[data-payment-method]:not([data-payment-method="card"])') ??
    section.querySelector<HTMLElement>("[data-payment-method]")
  );
}

/**
 * Brings the payment methods into view and puts keyboard focus on the first
 * method other than the card that just failed (the first method when card is
 * the only one).
 *
 * The list can change just after the click: the store's advance-payment rule arrives a moment
 * later and takes cash on delivery away, and the button that had the focus disappears (the focus
 * falls back to the page). For two seconds, when that happens the focus moves to the method that is
 * first now, unless the shopper has already clicked or pressed a key somewhere.
 */
export function showOtherPaymentMethods() {
  const section = document.getElementById(PAYMENT_METHODS_SECTION_ID);
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  firstOtherMethod(section)?.focus({ preventScroll: true });
  if (typeof MutationObserver === "undefined") return;

  const events = ["pointerdown", "keydown"] as const;
  const stop = () => {
    observer.disconnect();
    window.clearTimeout(timer);
    for (const type of events) document.removeEventListener(type, stop, true);
  };
  const observer = new MutationObserver(() => {
    const focused = document.activeElement;
    if (focused && focused !== document.body) {
      // Still on a method, or the shopper went elsewhere on purpose: leave it.
      if (!section.contains(focused)) stop();
      return;
    }
    firstOtherMethod(section)?.focus({ preventScroll: true });
  });
  const timer = window.setTimeout(stop, FOCUS_WATCH_MS);
  observer.observe(section, { childList: true, subtree: true });
  for (const type of events) document.addEventListener(type, stop, true);
}

/** Shown after a declined or cancelled card payment: retry with the card or pick another method. */
export function PaymentFailedCard({
  setMethod,
  submit,
  submitting,
  t,
}: {
  setMethod: ReturnType<typeof useCheckoutFulfillment>["setMethod"];
  submit: ReturnType<typeof usePlaceOrder>["submit"];
  submitting: ReturnType<typeof usePlaceOrder>["submitting"];
  t: Storefront["t"];
}) {
  return (
    <Card className="p-5 border-destructive bg-destructive/5 space-y-4 col-span-full">
      <div className="flex items-start gap-3">
        <X className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-destructive">
            {t("فشلت عملية الدفع أو تم إلغاؤها", "Payment failed or cancelled")}
          </h3>
          <p className="text-sm text-destructive/90 mt-1">
            {t(
              "لم يتم خصم أي مبلغ وتم حفظ سلتك. يرجى المحاولة مرة أخرى أو اختيار طريقة دفع أخرى.",
              "Payment was declined or cancelled. Your cart has been saved and no charges were made.",
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button
          size="sm"
          onClick={() => {
            setMethod("card");
            setTimeout(submit, 100);
          }}
          disabled={submitting}
        >
          <CreditCard className="w-4 h-4 me-2 rtl:ms-2 rtl:me-0" />
          {t("إعادة المحاولة بالبطاقة", "Retry Payment")}
        </Button>
        <Button size="sm" variant="outline" onClick={showOtherPaymentMethods}>
          {t("اختر طريقة دفع أخرى", "Choose Another Payment Method")}
        </Button>
      </div>
    </Card>
  );
}
