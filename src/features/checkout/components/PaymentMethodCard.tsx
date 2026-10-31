import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AdvanceSplit } from "@/lib/payments/advance-payment";
import { AdvancePaymentNotice } from "@/features/checkout/components/AdvancePaymentNotice";
import { BenefitTransferDetails } from "@/features/checkout/components/BenefitTransferDetails";
import { PayInFullChoice } from "@/features/checkout/components/PayInFullChoice";
import type { Dispatch, SetStateAction } from "react";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";

/** The payment method card's id, so "choose another payment method" can bring it into view. */
export const PAYMENT_METHODS_SECTION_ID = "payment-methods-section";

/** The payment methods for this destination, the Benefit transfer details and receipt upload, and the card note. */
export function PaymentMethodCard({
  availableMethods,
  benefitReceipt,
  brand,
  fulfillment,
  advance,
  fullChoice = null,
  currency,
  appointment = false,
  lang,
  method,
  selectedDestination,
  setBenefitReceipt,
  setMethod,
  settings,
  t,
}: {
  availableMethods: ReturnType<typeof useCheckoutFulfillment>["availableMethods"];
  benefitReceipt: File | null;
  brand: Storefront["brand"];
  fulfillment: ReturnType<typeof useCheckoutFulfillment>["fulfillment"];
  /** What the store's advance-payment rule asks of this order, and the currency, for the note. */
  advance: AdvanceSplit;
  /** The "pay everything now" choice, when the store offers it for this order. */
  fullChoice?: {
    base: AdvanceSplit;
    full: AdvanceSplit;
    payInFull: boolean;
    onChange: (payInFull: boolean) => void;
  } | null;
  currency: string;
  appointment?: boolean;
  lang: Storefront["lang"];
  method: ReturnType<typeof useCheckoutFulfillment>["method"];
  selectedDestination: ReturnType<typeof useCheckoutFulfillment>["selectedDestination"];
  setBenefitReceipt: Dispatch<SetStateAction<File | null>>;
  setMethod: ReturnType<typeof useCheckoutFulfillment>["setMethod"];
  settings: Storefront["settings"];
  t: Storefront["t"];
}) {
  return (
    <Card
      id={PAYMENT_METHODS_SECTION_ID}
      role="region"
      aria-labelledby={`${PAYMENT_METHODS_SECTION_ID}-title`}
      className="p-5 space-y-3 scroll-mt-24"
    >
      <h2 id={`${PAYMENT_METHODS_SECTION_ID}-title`} className="font-display text-xl">
        {t("طريقة الدفع", "Payment method")}
      </h2>
      {availableMethods.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("لا توجد طرق دفع مفعّلة حالياً.", "No payment methods enabled yet.")}
        </p>
      )}
      <div className="grid gap-2">
        {availableMethods.map((m: any) => {
          const Icon = m.icon;
          const active = method === m.id;
          return (
            <Button
              key={m.id}
              type="button"
              data-payment-method={m.id}
              aria-pressed={active}
              variant={active ? "outline" : "ghost"}
              onClick={() => setMethod(m.id)}
              className={`text-start flex items-center justify-start gap-3 p-3 rounded-lg border h-auto ${
                active ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="font-medium">{lang === "ar" ? m.ar : m.en}</span>
            </Button>
          );
        })}
      </div>

      {/* Under the store's advance rule: pay the advance or everything, then what to pay now. */}
      {fullChoice && (
        <PayInFullChoice {...fullChoice} currency={currency} appointment={appointment} />
      )}
      <AdvancePaymentNotice split={advance} currency={currency} appointment={appointment} />

      {fulfillment === "delivery" && selectedDestination !== "BH" && (
        <p className="text-xs text-muted-foreground pt-1">
          {t(
            "طرق الدفع المتاحة مخصصة بحسب وجهة الشحن المختارة.",
            "Available payment methods correspond to your selected shipping destination.",
          )}
        </p>
      )}

      {method === "benefit" && (
        <BenefitTransferDetails
          brand={brand}
          settings={settings}
          receipt={benefitReceipt}
          setReceipt={setBenefitReceipt}
          t={t}
        />
      )}

      {method === "card" && (
        <div className="mt-3 p-4 border rounded-lg text-sm text-center font-medium text-amber-800 border-amber-200/50 bg-amber-500/10 dark:text-amber-400 dark:border-amber-900/50 dark:bg-amber-950/10">
          {t(
            "سيتم تحويلك بشكل آمن إلى بوابة الدفع لإتمام عملية الدفع بالبطاقة فور تأكيد الطلب.",
            "You will be securely redirected to the payment gateway to complete your card payment upon placing the order.",
          )}
        </div>
      )}
    </Card>
  );
}
