import { createFileRoute, Link } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { confirmationSearch, parseConfirmation } from "@/lib/bookings/confirmation";
import { AppointmentSummary } from "@/features/storefront-booking/components/AppointmentSummary";
import { useEffect } from "react";

/**
 * How the order is fulfilled comes from the URL: checkout sets it from the
 * order it just placed, and the card gateway's redirect from the order on the
 * server. Editing the URL only changes which of the three messages the shopper
 * sees, never the order, so the page does not read the order (bug #19). A booking's
 * appointment travels the same way.
 */
type ThankYouSearch = {
  fulfillment: "pickup" | "digital" | "delivery";
  channel: "whatsapp" | "email";
  ref?: string;
  day?: string;
  start?: string;
  minutes?: string;
};

export const Route = createFileRoute("/$slug/thank-you/$orderId")({
  validateSearch: (search: Record<string, unknown>): ThankYouSearch => {
    // A booking's appointment (src/lib/bookings/confirmation.ts), when the order was one.
    const appointment = parseConfirmation(search);
    return {
      fulfillment:
        search.fulfillment === "pickup"
          ? "pickup"
          : search.fulfillment === "digital"
            ? "digital"
            : "delivery",
      channel: search.channel === "whatsapp" ? "whatsapp" : "email",
      ...(appointment ? confirmationSearch(appointment) : {}),
    };
  },
  component: ThankYou,
});

function ThankYou() {
  const { brand, settings, t, lang, clearCart } = useStorefront();
  const search = Route.useSearch();
  const { fulfillment, channel } = search;
  const appointment = parseConfirmation(search);
  const isAr = lang === "ar";

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  const isPickup = fulfillment === "pickup";
  const isDigital = fulfillment === "digital";

  return (
    <div className="mx-auto max-w-lg p-6 sm:p-8 animate-in fade-in duration-500">
      <Card className="p-6 sm:p-8 text-center relative overflow-hidden">
        {/* Ambient top design flourish */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: settings.primary_color }}
        ></div>

        <CheckCircle2
          className="h-14 w-14 mx-auto mb-4 animate-bounce duration-1000"
          style={{ color: settings.primary_color }}
        />
        <h1 className="font-display text-2xl sm:text-3xl mb-2">
          {appointment
            ? t("تم استلام حجزك!", "Your booking is in!")
            : t("شكراً لطلبك!", "Thank you for your order!")}
        </h1>
        {appointment && <AppointmentSummary appointment={appointment} isAr={isAr} />}
        <p className="text-sm sm:text-base text-muted-foreground mb-6 leading-relaxed">
          {appointment
            ? t(
                "احتفظ برقم الحجز، وسنتواصل معك إذا احتجنا أي تفاصيل عن موعدك.",
                "Keep your booking reference; we will contact you if we need any details about your appointment.",
              )
            : isDigital
              ? channel === "whatsapp"
                ? t(
                    "تم استلام طلبك وسيتم إرسال المنتج الرقمي إليك عبر واتساب بعد تجهيز الطلب.",
                    "We received your order. Your digital product will be sent through WhatsApp once it is ready.",
                  )
                : t(
                    "تم استلام طلبك وسيتم إرسال المنتج الرقمي إلى بريدك الإلكتروني بعد تجهيز الطلب.",
                    "We received your order. Your digital product will be sent to your email once it is ready.",
                  )
              : isPickup
                ? t(
                    "تم استلام طلبكم وسيتم التواصل معكم فور تجهيز الطلب للاستلام.",
                    "We received your order and will contact you as soon as it is ready for pickup.",
                  )
                : t(
                    "تم استلام طلبك وسيتم التواصل معك قريباً لتأكيد التوصيل.",
                    "We received your order and will contact you shortly to confirm delivery.",
                  )}
        </p>

        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="inline-flex px-8 py-3 rounded-full text-white font-medium active:scale-95 transition-all shadow-md hover:shadow-lg"
          style={{ backgroundColor: settings.primary_color }}
        >
          {t("متابعة التسوق", "Continue shopping")}
        </Link>
      </Card>
    </div>
  );
}
