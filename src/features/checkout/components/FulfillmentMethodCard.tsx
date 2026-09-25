import { formatPrice } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";
import type { Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";

/** Delivery, pickup or digital delivery, with each option's fee. */
export function FulfillmentMethodCard({
  currency,
  estimatedDeliveryText,
  fulfillment,
  fulfillmentOptions,
  lang,
  setFulfillment,
  settings,
  t,
}: {
  currency: Storefront["currency"];
  estimatedDeliveryText: ReturnType<typeof useCheckoutFulfillment>["estimatedDeliveryText"];
  fulfillment: ReturnType<typeof useCheckoutFulfillment>["fulfillment"];
  fulfillmentOptions: ReturnType<typeof useCheckoutFulfillment>["fulfillmentOptions"];
  lang: Storefront["lang"];
  setFulfillment: ReturnType<typeof useCheckoutFulfillment>["setFulfillment"];
  settings: Storefront["settings"];
  t: Storefront["t"];
}) {
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display text-xl">{t("طريقة التسليم", "Fulfillment method")}</h2>
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
              className={`text-start flex items-center justify-start gap-3 h-auto p-4 rounded-lg border transition-all ${
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
      {fulfillment === "delivery" && settings.delivery_estimate_enabled !== false && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2 border border-primary/10 mt-2">
          <Truck className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong className="text-foreground font-semibold">
              {t("التوصيل المتوقع", "Estimated delivery")}:
            </strong>{" "}
            {estimatedDeliveryText}
          </span>
        </div>
      )}
    </Card>
  );
}
