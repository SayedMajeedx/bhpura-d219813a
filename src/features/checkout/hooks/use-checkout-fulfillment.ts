import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Download, QrCode, Store, Truck } from "lucide-react";
import type { ShippingZone } from "@/lib/shipping";
import type { Fulfillment, Storefront } from "@/features/checkout/types";

/**
 * Delivery / pickup / digital, the delivery destination (Bahrain or a
 * shipping zone and country), the payment methods that destination allows,
 * and the delivery estimate. Choices are restored from sessionStorage.
 */
export function useCheckoutFulfillment({
  settings,
  lang,
}: {
  settings: Storefront["settings"];
  lang: Storefront["lang"];
}) {
  const fulfillmentOptions = useMemo(() => {
    const opts: Array<{ id: Fulfillment; ar: string; en: string; icon: any; fee: number }> = [];
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
        ar: "الدفع عند الاستلام",
        en: "Cash on delivery",
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

  const estimatedDeliveryText = useMemo(() => {
    if (fulfillment === "pickup") {
      return lang === "ar" ? "بعد إشعار جاهزية الطلب" : "After your ready notification";
    }
    if (fulfillment === "digital") {
      return lang === "ar" ? "فوري بعد إتمام الطلب" : "Instant upon order completion";
    }
    if (selectedDestination === "BH") {
      return lang === "ar"
        ? settings.delivery_estimate_ar || "خلال 24 - 48 ساعة داخل البحرين"
        : settings.delivery_estimate_en || "Within 24 - 48 hours in Bahrain";
    }
    if (selectedZone) {
      return lang === "ar"
        ? selectedZone.estimate_ar || "خلال 3 - 5 أيام عمل"
        : selectedZone.estimate_en || "3 - 5 business days";
    }
    return lang === "ar" ? "خلال 3 - 5 أيام عمل" : "3 - 5 business days";
  }, [
    fulfillment,
    selectedDestination,
    selectedZone,
    settings.delivery_estimate_ar,
    settings.delivery_estimate_en,
    lang,
  ]);

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
    estimatedDeliveryText,
  };
}
