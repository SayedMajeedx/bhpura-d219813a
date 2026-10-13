import {
  deliveryEstimateLines,
  readyEstimate,
  zoneEstimate,
  type EstimateKinds,
  type EstimateSettings,
} from "@/lib/delivery-estimate";
import {
  formatCountryName,
  getShippingPricingDescription,
  type ShippingZone,
} from "@/lib/shipping";

/**
 * Everything a shopper is told about delivery and returns, from one place.
 *
 * A store says how it delivers in its settings: whether it delivers and what it charges, how long
 * a ready piece and a made-to-order piece take, where else it ships and at what fee, whether an
 * order can be collected, how returns work, and anything else in its own words. `deliveryInfo`
 * turns those settings into the facts a shopper reads, and every screen that speaks about
 * delivery shows these facts (the product page's "Shipping & Returns", the preview a merchant
 * sees while editing). The time sentences are `delivery-estimate.ts`'s, shared with checkout.
 *
 * **Nothing here is made up.** A fact appears only when the store's own settings say it. The
 * product page once showed a fixed paragraph ("2-4 business days across all GCC countries,
 * returns within 14 days") to every store: stores that deliver in a day, do not ship abroad, or
 * take no returns; it read a setting that does not exist, so what a store wrote never showed.
 */

type Lang = "ar" | "en";

export type DeliveryInfoSettings = EstimateSettings & {
  delivery_enabled?: boolean | null;
  pickup_enabled?: boolean | null;
  delivery_estimate_enabled?: boolean | null;
  delivery_fee?: number | string | null;
  currency?: string | null;
  shipping_zones?: ShippingZone[] | null;
  shipping_returns_ar?: string | null;
  shipping_returns_en?: string | null;
};

/** What the facts read of the store's return policy (`brand_return_policies`). */
export type ReturnPolicyFacts = {
  return_window_days?: number | null;
  policy_terms_ar?: string | null;
  policy_terms_en?: string | null;
};

/** What the facts read of a store's own pages (Pages & Policies). */
export type PolicyPage = {
  slug: string | null;
  title_ar: string | null;
  title_en: string | null;
};

export type DeliveryFactId =
  "delivery_time" | "ready_time" | "making_time" | "delivery_fee" | "abroad" | "pickup" | "returns";

export type DeliveryFact = {
  id: DeliveryFactId;
  /** Unique among the facts (a store can ship to several zones). */
  key: string;
  label: string;
  text: string;
};

export type DeliveryInfo = {
  facts: DeliveryFact[];
  /** The store's own words about shipping and returns, if it wrote any. */
  note: string | null;
  /** The store's own return terms, if its return policy has any. */
  returnTerms: string | null;
  /** The store's pages about delivery and returns, to read in full (`idx` is the page's address). */
  pages: Array<{ idx: number; title: string }>;
  /** False when there is nothing at all to say: the section is then left out. */
  hasAnything: boolean;
};

const clean = (text: string | null | undefined) => text?.trim() || null;

const WORDS = {
  ar: {
    time: "مدة التوصيل",
    home: "التوصيل داخل البحرين",
    free: "مجاناً",
    pickup: "الاستلام من المتجر",
    pickupText: "متاح، بدون رسوم",
    returns: "الاسترجاع",
  },
  en: {
    time: "Delivery time",
    home: "Delivery within Bahrain",
    free: "Free",
    pickup: "Pickup from the store",
    pickupText: "Available, no charge",
    returns: "Returns",
  },
} as const;

/** "خلال 14 يوماً من استلام الطلب" / "Within 14 days of receiving your order". */
export function returnWindowText(days: number, lang: Lang): string {
  if (lang === "en") return `Within ${days} ${days === 1 ? "day" : "days"} of receiving your order`;
  const count =
    days === 1 ? "يوم واحد" : days === 2 ? "يومين" : days <= 10 ? `${days} أيام` : `${days} يوماً`;
  return `خلال ${count} من استلام الطلب`;
}

const POLICY_PAGE =
  /shipping|delivery|return|refund|exchange|شحن|توصيل|استرجاع|إرجاع|ارجاع|استبدال/i;

/** The store's pages about delivery or returns, by their address or either title. */
export function policyPagesOf(
  pages: readonly PolicyPage[] | null | undefined,
  lang: Lang,
): Array<{ idx: number; title: string }> {
  return (pages ?? []).flatMap((page, index) => {
    const title = clean(
      lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar,
    );
    const about = [page.slug, page.title_en, page.title_ar].some((text) =>
      POLICY_PAGE.test(text ?? ""),
    );
    return title && about ? [{ idx: index + 1, title }] : [];
  });
}

/**
 * What a shopper is told. `kinds` says which pieces the reader is looking at (a ready piece, a
 * made-to-order one, or a product sold both ways); `formatMoney` writes an amount the way the
 * storefront does.
 */
export function deliveryInfo({
  settings,
  lang,
  kinds = { ready: true, tailored: false },
  returnPolicy = null,
  pages = null,
  formatMoney,
}: {
  settings: DeliveryInfoSettings | null | undefined;
  lang: Lang;
  kinds?: EstimateKinds;
  returnPolicy?: ReturnPolicyFacts | null;
  pages?: readonly PolicyPage[] | null;
  formatMoney: (amount: number) => string;
}): DeliveryInfo {
  const s = settings ?? {};
  const words = WORDS[lang];
  const facts: DeliveryFact[] = [];
  const delivers = s.delivery_enabled !== false;

  if (delivers) {
    // How long: the store's own sentences, and only when it shows an estimate at all.
    if (s.delivery_estimate_enabled !== false) {
      for (const line of deliveryEstimateLines({
        kinds,
        settings: s,
        lang,
        readyText: readyEstimate(s, lang),
      })) {
        const id =
          line.kind === "ready"
            ? "ready_time"
            : line.kind === "tailored"
              ? "making_time"
              : "delivery_time";
        facts.push({ id, key: id, label: line.label ?? words.time, text: line.text });
      }
    }

    const fee = Math.max(0, Number(s.delivery_fee ?? 0) || 0);
    facts.push({
      id: "delivery_fee",
      key: "delivery_fee",
      label: words.home,
      text: fee > 0 ? formatMoney(fee) : words.free,
    });

    // Where else it ships: each zone the store set up, with its own fee and its own time.
    for (const zone of s.shipping_zones ?? []) {
      const name =
        clean(lang === "ar" ? zone.name_ar || zone.name_en : zone.name_en || zone.name_ar) ||
        (zone.countries ?? [])
          .map((code) => formatCountryName(code, lang))
          .join(lang === "ar" ? "، " : ", ");
      if (!name) continue;
      const time = zoneEstimate(zone, lang);
      const price = getShippingPricingDescription(zone, s.currency || "BHD", lang);
      facts.push({
        id: "abroad",
        key: `abroad:${zone.id || name}`,
        label: name,
        text: time ? `${price} · ${time}` : price,
      });
    }
  }

  if (s.pickup_enabled) {
    facts.push({ id: "pickup", key: "pickup", label: words.pickup, text: words.pickupText });
  }

  const window = Number(returnPolicy?.return_window_days ?? 0);
  if (returnPolicy && window > 0) {
    facts.push({
      id: "returns",
      key: "returns",
      label: words.returns,
      text: returnWindowText(window, lang),
    });
  }

  const note = clean(lang === "ar" ? s.shipping_returns_ar : s.shipping_returns_en);
  const returnTerms = clean(
    lang === "ar" ? returnPolicy?.policy_terms_ar : returnPolicy?.policy_terms_en,
  );
  const policyPages = policyPagesOf(pages, lang);

  return {
    facts,
    note,
    returnTerms,
    pages: policyPages,
    hasAnything:
      facts.length > 0 || Boolean(note) || Boolean(returnTerms) || policyPages.length > 0,
  };
}
