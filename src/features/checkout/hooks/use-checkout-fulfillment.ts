import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Download, MapPin, QrCode, Store, Truck } from "lucide-react";
import type { ShippingZone } from "@/lib/shipping";
import type { Fulfillment, Storefront } from "@/features/checkout/types";
import {
  deliveryEstimateLines,
  readyEstimate,
  tailoredEstimate,
  type EstimateKinds,
  type EstimateLine,
} from "@/lib/delivery-estimate";

const READY_ONLY: EstimateKinds = { ready: true, tailored: false };
const only = (text: string): EstimateLine[] => [{ kind: "all", label: null, text }];

/**
 * Delivery / pickup / digital, the delivery destination (Bahrain or a
 * shipping zone and country), the payment methods that destination allows,
 * and the delivery estimate. Choices are restored from sessionStorage.
 */
export function useCheckoutFulfillment({
  settings,
  lang,
  appointment = null,
  kinds = READY_ONLY,
}: {
  settings: Storefront["settings"];
  lang: Storefront["lang"];
  /**
   * The booking the cart is finishing. A booked service is not delivered:
   * it happens at the customer's venue (the travel fee applies) or, when the
   * store has a pickup place, at the store's.
   */
  appointment?: { travelFee?: number | null } | null;
  /** The kinds of piece in the cart, so a made-to-order piece gets its own delivery estimate. */
  kinds?: EstimateKinds;
}) {
  const isAppointment = Boolean(appointment);
  const travelFee = Number(appointment?.travelFee ?? 0);
  const fulfillmentOptions = useMemo(() => {
    const opts: Array<{ id: Fulfillment; ar: string; en: string; icon: any; fee: number }> = [];
    if (isAppointment) {
      // Whatever the store's shop settings (a services store may have
      // delivery off), a booking can always happen at the customer's venue.
      opts.push({
        id: "delivery",
        ar: "في موقع مناسبتي",
        en: "At my venue",
        icon: MapPin,
        fee: travelFee,
      });
      if (settings.pickup_enabled)
        opts.push({ id: "pickup", ar: "في مقرّكم", en: "At your place", icon: Store, fee: 0 });
      return opts;
    }
    if (settings.delivery_enabled)
      opts.push({
        id: "delivery",
        ar: "توصيل",
        en: "Delivery",
        icon: Truck,
        fee: settings.delivery_fee,
      });
    if (settings.pickup_enabled)
      opts.push({
        id: "pickup",
        ar: "استلام",
        en: "Pickup",
        icon: Store,
        fee: 0,
      });
    if (settings.digital_delivery_enabled)
      opts.push({
        id: "digital",
        ar: "تسليم رقمي",
        en: "Digital delivery",
        icon: Download,
        fee: 0,
      });
    return opts;
  }, [
    isAppointment,
    travelFee,
    settings.delivery_enabled,
    settings.pickup_enabled,
    settings.digital_delivery_enabled,
    settings.delivery_fee,
  ]);

  const [fulfillment, setFulfillment] = useState<Fulfillment>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("checkout_fulfillment");
      if (saved) return saved as any;
    }
    return fulfillmentOptions[0]?.id ?? "delivery";
  });
  useEffect(() => {
    if (fulfillmentOptions.length > 0 && !fulfillmentOptions.find((o) => o.id === fulfillment)) {
      setFulfillment(fulfillmentOptions[0].id);
    }
  }, [fulfillmentOptions, fulfillment]);

  // Delivery destination: "BH" (default domestic) or zone ID
  const [selectedDestination, setSelectedDestination] = useState<string>("BH");
  const zones = useMemo(
    () => (settings.shipping_zones ?? []) as ShippingZone[],
    [settings.shipping_zones],
  );

  // Selected country code (when international destination is chosen)
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("BH");

  const selectedZone = useMemo(() => {
    if (selectedDestination === "BH") return undefined;
    return zones.find((z) => z.id === selectedDestination);
  }, [zones, selectedDestination]);

  useEffect(() => {
    if (selectedDestination === "BH") {
      setSelectedCountryCode("BH");
    } else if (selectedZone && selectedZone.countries && selectedZone.countries.length > 0) {
      const countries = selectedZone.countries;
      setSelectedCountryCode((current) => (countries.includes(current) ? current : countries[0]));
    }
  }, [selectedDestination, selectedZone]);

  const availableMethods = useMemo(() => {
    const base: Array<{
      id: "cod" | "card" | "benefit";
      ar: string;
      en: string;
      icon: any;
    }> = [
      settings.cod_enabled && {
        id: "cod" as const,
        ar: isAppointment ? "الدفع يوم الموعد" : "الدفع عند الاستلام",
        en: isAppointment ? "Pay on the day" : "Cash on delivery",
        icon: Banknote,
      },
      settings.card_enabled && {
        id: "card" as const,
        ar: "الدفع بالبطاقة",
        en: "Card payment",
        icon: CreditCard,
      },
      settings.benefit_enabled && {
        id: "benefit" as const,
        ar: "عن طريق البنفت",
        en: "Benefit Pay",
        icon: QrCode,
      },
    ].filter(Boolean) as any;

    // Restrict payment methods based on destination zone (admin-configurable)
    if (fulfillment === "delivery" && selectedDestination !== "BH") {
      const allowed = Array.isArray(selectedZone?.allowed_payment_methods)
        ? selectedZone.allowed_payment_methods
        : ["card", "benefit"];
      return base.filter((m) => allowed.includes(m.id));
    }

    return base;
  }, [
    isAppointment,
    settings.cod_enabled,
    settings.card_enabled,
    settings.benefit_enabled,
    fulfillment,
    selectedDestination,
    selectedZone,
  ]);

  const [method, setMethod] = useState<"cod" | "card" | "benefit" | "">(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("checkout_method");
      if (saved) return saved as any;
    }
    return "";
  });

  useEffect(() => {
    if (availableMethods.length > 0) {
      if (!method || !availableMethods.some((m) => m.id === method)) {
        setMethod(availableMethods[0]?.id ?? "");
      }
    }
  }, [method, availableMethods]);

  const bahrainText =
    readyEstimate(settings, lang) ||
    (lang === "ar" ? "خلال 24 - 48 ساعة داخل البحرين" : "Within 24 - 48 hours in Bahrain");
  const zoneText = selectedZone
    ? (lang === "ar" ? selectedZone.estimate_ar : selectedZone.estimate_en) ||
      (lang === "ar" ? "خلال 3 - 5 أيام عمل" : "3 - 5 business days")
    : lang === "ar"
      ? "خلال 3 - 5 أيام عمل"
      : "3 - 5 business days";

  /** What is said about delivery for this cart; a made-to-order piece keeps its own time. */
  const estimatedDeliveryLines = useMemo((): EstimateLine[] => {
    if (isAppointment) return only(lang === "ar" ? "في موعد حجزك" : "At your booked time");
    if (fulfillment === "pickup") {
      return only(lang === "ar" ? "بعد إشعار جاهزية الطلب" : "After your ready notification");
    }
    if (fulfillment === "digital") {
      return only(lang === "ar" ? "فوري بعد إتمام الطلب" : "Instant upon order completion");
    }
    if (selectedDestination === "BH") {
      return deliveryEstimateLines({ kinds, settings, lang, readyText: bahrainText });
    }
    // Outside Bahrain a made-to-order piece is made first and then shipped.
    return deliveryEstimateLines({
      kinds,
      settings,
      lang,
      readyText: zoneText,
      afterMaking: zoneText,
    });
  }, [
    isAppointment,
    fulfillment,
    selectedDestination,
    bahrainText,
    zoneText,
    kinds,
    settings,
    lang,
  ]);

  /** The same for the Bahrain card in the address step, shown only when the store wrote one. */
  const homeEstimateLines = useMemo(
    (): EstimateLine[] =>
      readyEstimate(settings, lang) || tailoredEstimate(settings, lang)
        ? deliveryEstimateLines({ kinds, settings, lang, readyText: bahrainText })
        : [],
    [kinds, settings, lang, bahrainText],
  );

  return {
    fulfillmentOptions,
    fulfillment,
    setFulfillment,
    selectedDestination,
    setSelectedDestination,
    zones,
    selectedCountryCode,
    setSelectedCountryCode,
    selectedZone,
    availableMethods,
    method,
    setMethod,
    estimatedDeliveryLines,
    homeEstimateLines,
  };
}
