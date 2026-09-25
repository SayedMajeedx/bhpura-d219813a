import { formatPrice } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";
import type { usePlaceOrder } from "@/features/checkout/hooks/use-place-order";

/** The total and Place order button pinned to the bottom on phones. */
export function MobileCheckoutBar({
  acceptedTerms,
  availableMethods,
  benefitReceipt,
  currency,
  fulfillmentOptions,
  grandTotal,
  lang,
  method,
  submit,
  submitting,
  t,
}: {
  acceptedTerms: boolean;
  availableMethods: ReturnType<typeof useCheckoutFulfillment>["availableMethods"];
  benefitReceipt: File | null;
  currency: Storefront["currency"];
  fulfillmentOptions: ReturnType<typeof useCheckoutFulfillment>["fulfillmentOptions"];
  grandTotal: number;
  lang: Storefront["lang"];
  method: ReturnType<typeof useCheckoutFulfillment>["method"];
  submit: ReturnType<typeof usePlaceOrder>["submit"];
  submitting: ReturnType<typeof usePlaceOrder>["submitting"];
  t: Storefront["t"];
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{t("الإجمالي", "Total")}</div>
          <div className="truncate text-lg font-bold text-primary">
            {formatPrice(grandTotal, currency, lang)}
          </div>
        </div>
        <Button
          className="h-12 min-w-36 shrink-0 bg-primary text-primary-foreground rounded-lg"
          disabled={
            submitting ||
            availableMethods.length === 0 ||
            fulfillmentOptions.length === 0 ||
            !acceptedTerms ||
            (method === "benefit" && !benefitReceipt)
          }
          onClick={submit}
        >
          {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
          {t("تأكيد الطلب", "Place order")}
        </Button>
      </div>
    </div>
  );
}
