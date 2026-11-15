import { formatPrice } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";

/** Delivery, pickup or digital delivery, with each option's fee. */
export function FulfillmentMethodCard({
  currency,
  fulfillment,
  fulfillmentOptions,
  lang,
  setFulfillment,
  t,
  appointment = false,
}: {
  /** The order is a booked service: where it happens, not how it ships. */
  appointment?: boolean;
  currency: Storefront["currency"];
  fulfillment: ReturnType<typeof useCheckoutFulfillment>["fulfillment"];
  fulfillmentOptions: ReturnType<typeof useCheckoutFulfillment>["fulfillmentOptions"];
  lang: Storefront["lang"];
  setFulfillment: ReturnType<typeof useCheckoutFulfillment>["setFulfillment"];
  t: Storefront["t"];
}) {
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display text-xl">
        {appointment
          ? t("أين تُقدَّم الخدمة؟", "Where is the service?")
          : t("طريقة التسليم", "Fulfillment method")}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fulfillmentOptions.map((opt) => {
          const Icon = opt.icon;
          const active = fulfillment === opt.id;
          return (
            <Button
              key={opt.id}
              type="button"
              variant={active ? "outline" : "ghost"}
              onClick={() => setFulfillment(opt.id)}
              className={`text-start flex items-center justify-start gap-3 h-auto whitespace-normal p-4 rounded-lg border transition ${
                active ? "border-primary bg-primary/10" : ""
              }`}
            >
              <div
                className={`h-10 w-10 rounded-md grid place-items-center shrink-0 transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{lang === "ar" ? opt.ar : opt.en}</div>
                <div className="text-xs text-muted-foreground">
                  {opt.fee > 0 ? formatPrice(opt.fee, currency, lang) : t("مجانًا", "Free")}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
      {/* The delivery time is said once, in the order summary. */}
    </Card>
  );
}
