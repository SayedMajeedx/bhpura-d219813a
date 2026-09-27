import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, X } from "lucide-react";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";
import type { usePlaceOrder } from "@/features/checkout/hooks/use-place-order";
import { PAYMENT_METHODS_SECTION_ID } from "@/features/checkout/components/PaymentMethodCard";

/**
 * Brings the payment methods into view and puts keyboard focus on the first
 * method other than the card that just failed (the first method when card is
 * the only one).
 */
export function showOtherPaymentMethods() {
  const section = document.getElementById(PAYMENT_METHODS_SECTION_ID);
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  const target =
    section.querySelector<HTMLElement>('[data-payment-method]:not([data-payment-method="card"])') ??
    section.querySelector<HTMLElement>("[data-payment-method]");
  target?.focus({ preventScroll: true });
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
