import { calculateShippingFee, type ShippingZone } from "@/lib/shipping";
import { ADVANCE_HOME_COUNTRY } from "@/lib/payments/advance-rules";
import { storefrontCanonical } from "@/lib/seo/canonical";

/**
 * What Google reads of how a product is delivered and returned (schema.org `shippingDetails` and
 * `hasMerchantReturnPolicy` on its offer, which Google wants for full product results). Like the
 * product page's own "Shipping & Returns" (`deliveryInfo`), **it says only what the store's
 * settings say**: the fee it set, the countries it ships to, the return window of its return
 * policy. A delivery time is free text in the settings ("24 - 48 hours"), so none is published; a
 * store with no return window publishes no return policy.
 */

type Store = { slug: string; custom_domain?: string | null };

export type DeliverySettings = {
  delivery_enabled?: boolean | null;
  delivery_fee?: number | string | null;
  currency?: string | null;
  shipping_zones?: ShippingZone[] | null;
};

export type ReturnPolicyForGoogle = {
  return_window_days?: number | null;
  customer_shipping_fee_borne_by?: string | null;
  return_shipping_fee?: number | string | null;
};

const COUNTRY = /^[A-Z]{2}$/;

/** The country codes a zone names (a wildcard zone names none: it is not a list of countries). */
const zoneCountries = (zone: ShippingZone) =>
  (zone.countries ?? [])
    .map((code) => String(code).trim().toUpperCase())
    .filter((c) => COUNTRY.test(c));

/** Every country the store delivers to: its own, then each shipping zone's. */
export function deliveryCountries(settings: DeliverySettings | null | undefined): string[] {
  if (settings?.delivery_enabled === false) return [];
  const all = [ADVANCE_HOME_COUNTRY, ...(settings?.shipping_zones ?? []).flatMap(zoneCountries)];
  return [...new Set(all)];
}

const money = (value: number, currency: string) => ({
  "@type": "MonetaryAmount",
  value: Number(value.toFixed(3)),
  currency,
});

/**
 * One `OfferShippingDetails` for the store's own country at its delivery fee, and one for each
 * shipping zone at what it charges for one piece. Null when the store does not deliver.
 */
export function shippingDetailsFor(settings: DeliverySettings | null | undefined) {
  if (!settings || settings.delivery_enabled === false) return null;
  const currency = (settings.currency || "BHD").toUpperCase();
  const local = Math.max(0, Number(settings.delivery_fee ?? 0) || 0);
  const details: Array<Record<string, unknown>> = [
    {
      "@type": "OfferShippingDetails",
      shippingRate: money(local, currency),
      shippingDestination: { "@type": "DefinedRegion", addressCountry: ADVANCE_HOME_COUNTRY },
    },
  ];
  for (const zone of settings.shipping_zones ?? []) {
    const countries = zoneCountries(zone).filter((code) => code !== ADVANCE_HOME_COUNTRY);
    if (countries.length === 0) continue;
    details.push({
      "@type": "OfferShippingDetails",
      shippingRate: money(calculateShippingFee(zone, 1, local), currency),
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: countries.length === 1 ? countries[0] : countries,
      },
    });
  }
  return details;
}

const RETURN_PAGE = /return|refund|exchange|استرجاع|إرجاع|ارجاع|استبدال/i;

/**
 * The store's return policy as Google reads it: a finite window of N days for the countries it
 * delivers to, free or paid return shipping as the policy says, and a link to the store's own page
 * about returns when it has one. Null when the policy sets no window.
 */
export function returnPolicyFor({
  policy,
  settings,
  store,
  pages,
}: {
  policy: ReturnPolicyForGoogle | null | undefined;
  settings: DeliverySettings | null | undefined;
  store: Store;
  pages?: ReadonlyArray<{
    slug?: string | null;
    title_en?: string | null;
    title_ar?: string | null;
  }> | null;
}) {
  const days = Math.round(Number(policy?.return_window_days ?? 0));
  if (!policy || !(days > 0)) return null;
  const countries = deliveryCountries(settings);
  const currency = (settings?.currency || "BHD").toUpperCase();
  const fee = Math.max(0, Number(policy.return_shipping_fee ?? 0) || 0);
  const page = (pages ?? []).find(
    (candidate) =>
      candidate.slug &&
      [candidate.slug, candidate.title_en, candidate.title_ar].some((text) =>
        RETURN_PAGE.test(text ?? ""),
      ),
  );
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: countries.length > 0 ? countries : [ADVANCE_HOME_COUNTRY],
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: days,
    ...(policy.customer_shipping_fee_borne_by === "store"
      ? { returnFees: "https://schema.org/FreeReturn" }
      : policy.customer_shipping_fee_borne_by === "customer" && fee > 0
        ? {
            returnFees: "https://schema.org/ReturnShippingFees",
            returnShippingFeesAmount: money(fee, currency),
          }
        : {}),
    ...(page?.slug
      ? { merchantReturnLink: storefrontCanonical(store, encodeURIComponent(page.slug)) }
      : {}),
  };
}
