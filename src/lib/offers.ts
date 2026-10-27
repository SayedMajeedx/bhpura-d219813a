import { arNounOblique, countOf } from "@/lib/arabic-count";

/**
 * A store's automatic offers as a shopper reads them (`storefront_active_offers`): a discount with
 * no code, buy X get Y, and free delivery over an amount. What an order actually gets is the
 * database's (`store_offers_outcome`, applied by the order builder and previewed for checkout by
 * `storefront_offers_preview`); this file only says which offers reach a product, how an offer
 * reads, and how far a cart is from free delivery.
 */

export type OfferKind = "discount" | "free_delivery" | "buy_x_get_y";

export interface StoreOffer {
  id: string;
  kind: OfferKind;
  name_ar: string;
  name_en: string;
  ends_at: string | null;
  min_subtotal: number | null;
  min_items: number | null;
  product_ids: string[];
  category_slugs: string[];
  exclude_sale_items: boolean;
  discount_type: "percentage" | "fixed" | null;
  discount_value: number | null;
  max_discount: number | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  get_product_ids: string[];
  get_category_slugs: string[];
  get_percent: number | null;
  max_sets: number | null;
  local_only: boolean;
}

/** An offer an order got (`orders.applied_offers`, and the preview's `applied`). */
export interface AppliedOffer {
  id: string;
  kind: OfferKind;
  name_ar: string | null;
  name_en: string | null;
  amount: number;
}

/** What the checkout's preview says the cart gets. */
export interface OffersOutcome {
  offer_discount: number;
  code_discount: number;
  code_kept: boolean;
  code_dropped: boolean;
  free_delivery: boolean;
  applied: AppliedOffer[];
}

type Lang = "ar" | "en";
type Money = (amount: number) => string;

const names = (list: readonly unknown[] | null | undefined) => (list ?? []).length > 0;

/** Whether an offer names no products and no categories (it reaches every line). */
export const storeWide = (offer: Pick<StoreOffer, "product_ids" | "category_slugs">) =>
  !names(offer.product_ids) && !names(offer.category_slugs);

/**
 * Whether an offer reaches a product, as `store_offer_reaches` reads a line: a product it names,
 * a product in a category it names, or any product when it names none; a piece on sale is left
 * out when the offer says so.
 */
export function offerReaches(
  offer: StoreOffer,
  product: { id: string; category?: string | null; onSale?: boolean },
): boolean {
  if (offer.exclude_sale_items && product.onSale) return false;
  if (storeWide(offer)) return true;
  return (
    (offer.product_ids ?? []).includes(product.id) ||
    (product.category != null && (offer.category_slugs ?? []).includes(product.category))
  );
}

/** The offers that reach a product, for its page: its price offers, then free delivery. */
export function offersForProduct(
  offers: readonly StoreOffer[],
  product: { id: string; category?: string | null; onSale?: boolean },
): StoreOffer[] {
  const reaching = offers.filter((offer) => offerReaches(offer, product));
  return [
    ...reaching.filter((offer) => offer.kind !== "free_delivery"),
    ...reaching.filter((offer) => offer.kind === "free_delivery"),
  ];
}

const percent = (value: number) => `${Number(value.toFixed(2))}%`;

/** "Buy 2, get 1 free" / "اشترِ قطعتين واحصل على قطعة واحدة مجانًا". */
function buyGetTerms(offer: StoreOffer, lang: Lang): string {
  const buy = offer.buy_quantity ?? 1;
  const get = offer.get_quantity ?? 1;
  const free = (offer.get_percent ?? 100) >= 100;
  if (lang === "ar") {
    const what = `اشترِ ${arNounOblique(buy, "piece")} واحصل على ${arNounOblique(get, "piece")}`;
    return free ? `${what} مجانًا` : `${what} بخصم ${percent(offer.get_percent ?? 0)}`;
  }
  return free
    ? `Buy ${buy}, get ${get} free`
    : `Buy ${buy}, get ${get} at ${percent(offer.get_percent ?? 0)} off`;
}

/** What it asks: "on orders over 40.000 BHD", "when you buy 3 pieces or more". */
function conditionTerms(offer: StoreOffer, lang: Lang, money: Money): string {
  const parts: string[] = [];
  if (offer.min_subtotal != null && offer.min_subtotal > 0) {
    parts.push(
      lang === "ar"
        ? `للطلبات من ${money(offer.min_subtotal)}`
        : `on orders of ${money(offer.min_subtotal)} or more`,
    );
  }
  if (offer.min_items != null && offer.min_items > 1) {
    parts.push(
      lang === "ar"
        ? `عند شراء ${arNounOblique(offer.min_items, "piece")} أو أكثر`
        : `when you buy ${countOf(offer.min_items, "piece", "en")} or more`,
    );
  }
  return parts.join(lang === "ar" ? " و" : " and ");
}

/**
 * An offer's terms in the shopper's language: "10% off on orders of 40.000 BHD or more",
 * "Buy 2, get 1 free", "Free local delivery on orders of 30.000 BHD or more".
 */
export function offerTerms(offer: StoreOffer, lang: Lang, money: Money): string {
  const condition = offer.kind === "buy_x_get_y" ? "" : conditionTerms(offer, lang, money);
  let head: string;
  if (offer.kind === "buy_x_get_y") {
    head = buyGetTerms(offer, lang);
  } else if (offer.kind === "free_delivery") {
    head =
      lang === "ar"
        ? offer.local_only
          ? "توصيل محلي مجاني"
          : "توصيل مجاني"
        : offer.local_only
          ? "Free local delivery"
          : "Free delivery";
  } else {
    const value = offer.discount_value ?? 0;
    const amount = offer.discount_type === "percentage" ? percent(value) : money(value);
    head = lang === "ar" ? `خصم ${amount}` : `${amount} off`;
    if (offer.discount_type === "percentage" && offer.max_discount != null) {
      head +=
        lang === "ar"
          ? ` حتى ${money(offer.max_discount)}`
          : ` (up to ${money(offer.max_discount)})`;
    }
  }
  return condition ? `${head} ${condition}` : head;
}

/**
 * When an offer ends, as a shopper reads it near its end: "Ends today", "Ends tomorrow", "Ends in
 * 3 days" within the week, else "Until 31 Oct" (`offerEnds`); null with no end.
 */
export function offerCountdown(
  offer: Pick<StoreOffer, "ends_at">,
  lang: Lang,
  now: Date = new Date(),
): string | null {
  if (!offer.ends_at) return null;
  const at = new Date(offer.ends_at);
  if (Number.isNaN(at.getTime())) return null;
  const days = Math.ceil((at.getTime() - now.getTime()) / 86_400_000);
  if (days <= 1) return lang === "ar" ? "ينتهي اليوم" : "Ends today";
  if (days === 2) return lang === "ar" ? "ينتهي غدًا" : "Ends tomorrow";
  if (days <= 6) {
    return lang === "ar" ? `ينتهي خلال ${arNounOblique(days, "day")}` : `Ends in ${days} days`;
  }
  return offerEnds(offer, lang);
}

/** When an offer ends, in the shopper's words: "Until 31 Oct" / "حتى 31 أكتوبر". */
export function offerEnds(offer: Pick<StoreOffer, "ends_at">, lang: Lang): string | null {
  if (!offer.ends_at) return null;
  const at = new Date(offer.ends_at);
  if (Number.isNaN(at.getTime())) return null;
  const day = new Intl.DateTimeFormat(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(at);
  return lang === "ar" ? `حتى ${day}` : `Until ${day}`;
}

/** An applied offer's name: the store's own, else what kind of offer it is. */
export function appliedOfferName(offer: AppliedOffer, lang: Lang): string {
  const own = lang === "ar" ? offer.name_ar || offer.name_en : offer.name_en || offer.name_ar;
  if (own && own.trim()) return own.trim();
  if (offer.kind === "free_delivery") return lang === "ar" ? "توصيل مجاني" : "Free delivery";
  return lang === "ar" ? "عرض المتجر" : "Store offer";
}

type CartLine = { price: number; qty: number; original_price?: number | null };

export type FreeDeliveryNudge =
  | { state: "unlocked"; offer: StoreOffer }
  | { state: "short"; offer: StoreOffer; remaining: number };

/**
 * How far a cart is from free delivery, for the cart: only offers that reach every product and
 * ask an amount alone can be said this simply (one naming products, categories or a number of
 * pieces is still applied at checkout). The nearest such offer; null when the store has none.
 */
export function freeDeliveryNudge(
  offers: readonly StoreOffer[],
  cart: readonly CartLine[],
): FreeDeliveryNudge | null {
  const simple = offers.filter(
    (offer) => offer.kind === "free_delivery" && storeWide(offer) && (offer.min_items ?? 0) <= 1,
  );
  if (simple.length === 0 || cart.length === 0) return null;
  let best: FreeDeliveryNudge | null = null;
  for (const offer of simple) {
    const total = cart
      .filter((line) => !(offer.exclude_sale_items && (line.original_price ?? 0) > line.price))
      .reduce((sum, line) => sum + line.price * line.qty, 0);
    const remaining = Math.round(((offer.min_subtotal ?? 0) - total) * 1000) / 1000;
    if (remaining <= 0) return { state: "unlocked", offer };
    if (!best || (best.state === "short" && remaining < best.remaining)) {
      best = { state: "short", offer, remaining };
    }
  }
  return best;
}

/** The nudge's sentence: "Add 4.000 BHD more for free local delivery". */
export function nudgeSentence(nudge: FreeDeliveryNudge, lang: Lang, money: Money): string {
  const local = nudge.offer.local_only;
  if (nudge.state === "unlocked") {
    if (lang === "ar")
      return local ? "طلبك يحصل على توصيل محلي مجاني" : "طلبك يحصل على توصيل مجاني";
    return local ? "Your order gets free local delivery" : "Your order gets free delivery";
  }
  if (lang === "ar") {
    return `أضف ${money(nudge.remaining)} ليصبح ${local ? "التوصيل المحلي" : "التوصيل"} مجانيًا`;
  }
  return `Add ${money(nudge.remaining)} more for free${local ? " local" : ""} delivery`;
}

/** An order's offers as stored (`orders.applied_offers`): only well-formed entries. */
export function appliedOffersOf(value: unknown): AppliedOffer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is AppliedOffer =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as AppliedOffer).kind === "string" &&
      Number.isFinite(Number((entry as AppliedOffer).amount)),
  );
}

/** The discount line's label on an order: its code and its offers' names, as written. */
export function discountSources(
  order: { promo_code?: string | null; applied_offers?: unknown },
  lang: Lang,
): string {
  const offers = appliedOffersOf(order.applied_offers)
    .filter((offer) => offer.kind !== "free_delivery")
    .map((offer) => appliedOfferName(offer, lang));
  const code = order.promo_code
    ? lang === "ar"
      ? `رمز ${order.promo_code}`
      : `Promo: ${order.promo_code}`
    : null;
  return [code, ...offers].filter(Boolean).join(lang === "ar" ? "، " : ", ");
}
