import { readyEstimate, tailoredEstimate, type EstimateSettings } from "@/lib/delivery-estimate";
import { getCountryByCode, type ShippingZone } from "@/lib/shipping";
import { formatAmount } from "@/features/content-studio/lib/batch";

/**
 * How to Order: the steps a shopper takes with this store, said only from its
 * own settings. How it is reached (the link in the bio, its WhatsApp), how it
 * takes payment (its switches, and an advance it asks for), how an order gets
 * to the shopper (delivery and its fee, the time it wrote, the countries it
 * ships to, pickup) and how long a made-to-order piece takes when it wrote
 * that. A step with nothing to say is left out, and no time, fee or method is
 * ever filled in for the store.
 */

type Lang = "ar" | "en";

/** The settings the steps read (a `business_settings` row has them all). */
export type HowToOrderSettings = EstimateSettings & {
  storefront_mode?: string | null;
  cod_enabled?: boolean | null;
  card_enabled?: boolean | null;
  benefit_enabled?: boolean | null;
  advance_payment_enabled?: boolean | null;
  advance_payment_percent?: number | null;
  advance_payment_scope?: string | null;
  delivery_enabled?: boolean | null;
  delivery_estimate_enabled?: boolean | null;
  delivery_fee?: number | string | null;
  pickup_enabled?: boolean | null;
  shipping_zones?: unknown;
  currency?: string | null;
};

/**
 * One line of a step, as pieces in reading order: a line that joins words to
 * an amount or a number ("Delivery", "2.000 BHD") keeps them apart, so they
 * never reorder into each other when drawn.
 */
export type StepLine = string[];

export type OrderStep = {
  key: "choose" | "pay" | "receive" | "making";
  title: string;
  lines: StepLine[];
};

const WORDS = {
  en: {
    choose: "Choose",
    bio: "From the link in our bio",
    whatsapp: "Or on WhatsApp",
    catalogChoose: "Send us the piece",
    catalogWhatsapp: "On WhatsApp",
    pay: "Pay",
    card: "Card",
    benefit: "BenefitPay",
    transfer: "Bank transfer",
    cod: "Cash on delivery",
    receive: "Receive",
    delivery: "Delivery",
    freeDelivery: "Free delivery",
    pickup: "Or pick up from us",
    pickupOnly: "Pick up from us",
    abroad: "We also ship to",
    more: "and more",
    making: "Made to order",
  },
  ar: {
    choose: "الطلب",
    bio: "من الرابط في البايو",
    whatsapp: "أو عبر واتساب",
    catalogChoose: "صورة القطعة تكفي",
    catalogWhatsapp: "عبر واتساب",
    pay: "الدفع",
    card: "بطاقة",
    benefit: "بنفت باي",
    transfer: "تحويل بنكي",
    cod: "الدفع عند الاستلام",
    receive: "الاستلام",
    delivery: "التوصيل",
    freeDelivery: "توصيل مجاني",
    pickup: "أو الاستلام من عندنا",
    pickupOnly: "الاستلام من عندنا",
    abroad: "ونشحن إلى",
    more: "وغيرها",
    making: "حسب الطلب",
  },
} as const;

/** The deposit line for an advance the store asks for, by what it reaches. */
function advanceLine(percent: number, scope: string, lang: Lang): string | null {
  const p = Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
  const en: Record<string, string> = {
    all: `${p}% to confirm, the rest on delivery`,
    made_to_order: `${p}% to confirm a made-to-order piece`,
    delivery: `${p}% to confirm a delivery`,
    made_to_order_or_delivery: `${p}% to confirm made-to-order and delivered orders`,
  };
  const ar: Record<string, string> = {
    all: `${p}٪ لتأكيد الطلب، والباقي عند الاستلام`,
    made_to_order: `${p}٪ لتأكيد القطع حسب الطلب`,
    delivery: `${p}٪ لتأكيد طلبات التوصيل`,
    made_to_order_or_delivery: `${p}٪ لتأكيد طلبات التوصيل والقطع حسب الطلب`,
  };
  return (lang === "ar" ? ar : en)[scope] ?? null;
}

/**
 * The Gulf's countries as people write them in a post ("السعودية", "UAE"),
 * not their formal names ("المملكة العربية السعودية"). Others keep the
 * country list's name.
 */
const SHORT_NAMES: Record<string, { en: string; ar: string }> = {
  SA: { en: "Saudi Arabia", ar: "السعودية" },
  AE: { en: "UAE", ar: "الإمارات" },
  KW: { en: "Kuwait", ar: "الكويت" },
  QA: { en: "Qatar", ar: "قطر" },
  OM: { en: "Oman", ar: "عُمان" },
  BH: { en: "Bahrain", ar: "البحرين" },
};

/**
 * The places a store ships to, as a shopper names them: a zone by its own
 * name, else each of its countries, once each, in the store's order.
 */
function shipsTo(zones: readonly ShippingZone[], lang: Lang): string[] {
  const names: string[] = [];
  for (const zone of zones) {
    const own = (
      lang === "ar" ? zone.name_ar || zone.name_en : zone.name_en || zone.name_ar
    )?.trim();
    const zoneNames = own
      ? [own]
      : (zone.countries ?? []).flatMap((code) => {
          const short = SHORT_NAMES[code.toUpperCase()];
          if (short) return [short[lang]];
          const info = getCountryByCode(code);
          return info ? [lang === "ar" ? info.name_ar : info.name_en] : [];
        });
    for (const name of zoneNames) if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The steps, in order, from the store's settings. `currencyLabel` is how the
 * studio writes the store's currency; `whatsapp` its number (null to leave
 * it out); `makingWord` the store's own word for made to order.
 */
export function howToOrderSteps(
  settings: HowToOrderSettings | null | undefined,
  {
    lang,
    currencyLabel,
    whatsapp,
    makingWord,
  }: { lang: Lang; currencyLabel: string; whatsapp: string | null; makingWord?: string | null },
): OrderStep[] {
  const s = settings ?? {};
  const words = WORDS[lang];
  const steps: OrderStep[] = [];
  const catalog = s.storefront_mode === "catalog";
  const number = whatsapp?.trim() || null;

  // Where to order. A catalog store takes orders on WhatsApp alone.
  if (catalog) {
    if (number) {
      steps.push({
        key: "choose",
        title: words.choose,
        lines: [[words.catalogChoose], [words.catalogWhatsapp, number]],
      });
    }
  } else {
    steps.push({
      key: "choose",
      title: words.choose,
      lines: number ? [[words.bio], [words.whatsapp, number]] : [[words.bio]],
    });
  }

  // How to pay: only the methods the checkout offers, and only where there is a checkout.
  if (!catalog) {
    const methods: string[] = [];
    if (s.card_enabled) methods.push(words.card);
    if (s.benefit_enabled) {
      methods.push((s.currency || "BHD") === "BHD" ? words.benefit : words.transfer);
    }
    if (s.cod_enabled) methods.push(words.cod);
    if (methods.length > 0) {
      const lines: StepLine[] = [[methods.join("  ·  ")]];
      const percent = Number(s.advance_payment_percent ?? 0);
      if (s.advance_payment_enabled && percent > 0 && percent < 100) {
        const line = advanceLine(percent, s.advance_payment_scope || "all", lang);
        if (line) lines.push([line]);
      }
      steps.push({ key: "pay", title: words.pay, lines });
    }
  }

  // How it arrives.
  const receive: StepLine[] = [];
  const delivers = s.delivery_enabled !== false;
  if (delivers) {
    const fee = Math.max(0, Number(s.delivery_fee ?? 0) || 0);
    receive.push(
      fee > 0 ? [words.delivery, `${formatAmount(fee)} ${currencyLabel}`] : [words.freeDelivery],
    );
    const time = s.delivery_estimate_enabled === false ? null : readyEstimate(s, lang);
    if (time) receive.push([time]);
    const zones = Array.isArray(s.shipping_zones) ? (s.shipping_zones as ShippingZone[]) : [];
    // Three places at most: a list longer than that is not read in a story.
    const names = shipsTo(zones, lang);
    if (names.length > 0) {
      const shown = names.slice(0, 3).join(lang === "ar" ? "، " : ", ");
      receive.push([`${words.abroad} ${shown}${names.length > 3 ? ` ${words.more}` : ""}`]);
    }
  }
  if (s.pickup_enabled) receive.push([delivers ? words.pickup : words.pickupOnly]);
  if (receive.length > 0) steps.push({ key: "receive", title: words.receive, lines: receive });

  // How long a made-to-order piece takes, when the store wrote it.
  const making = delivers ? tailoredEstimate(s, lang) : null;
  if (making) {
    steps.push({ key: "making", title: makingWord?.trim() || words.making, lines: [[making]] });
  }

  return steps;
}
