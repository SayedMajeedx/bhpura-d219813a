import { createFileRoute, Link } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/$slug/thank-you/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    fulfillment: search.fulfillment === "pickup" ? "pickup" as const : "delivery" as const,
  }),
  component: ThankYou,
});

function ThankYou() {
  const { brand, settings, t } = useStorefront();
  const { fulfillment } = Route.useSearch();
  const isPickup = fulfillment === "pickup";
  return (
    <div className="mx-auto max-w-lg p-8">
      <Card className="p-8 text-center">
        <CheckCircle2 className="h-14 w-14 mx-auto mb-4" style={{ color: settings.primary_color }} />
        <h1 className="font-display text-2xl mb-2">{t("شكراً لطلبك!", "Thank you for your order!")}</h1>
        <p className="text-muted-foreground mb-6">
          {isPickup
            ? t(
                "تم استلام طلبكم وسيتم التواصل معكم فور تجهيز الطلب للاستلام من الفرع.",
                "We received your order and will contact you as soon as it is ready for pickup from the branch.",
              )
            : t(
                "تم استلام طلبك وسيتم التواصل معك قريباً لتأكيد التوصيل.",
                "We received your order and will contact you shortly to confirm delivery.",
              )}
        </p>
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="inline-flex px-6 py-3 rounded-full text-white"
          style={{ backgroundColor: settings.primary_color }}
        >
          {t("متابعة التسوق", "Continue shopping")}
        </Link>
      </Card>
    </div>
  );
}
