import { offerReaches, type StoreOffer } from "@/lib/offers";
import {
  buyableVariants,
  cardPrice,
  sellingPrice,
  variantDiscounted,
  type CardPrice,
  type PricedProduct,
  type PricedVariant,
} from "@/lib/product-price";

/**
 * A store's automatic offers on a price, before checkout (the owner's decision of 2026-10-27):
 * a percentage off with no conditions is the price a shopper pays, so the price itself is struck
 * through and the card says "−26%"; any other offer that reaches the product (a minimum amount or
 * number of pieces, buy X get Y, a fixed amount off the order) is an "Offer" badge and its terms
 * on the product's page, since the price changes only when its terms are met. Free delivery is
 * the cart's and the product page's, never a card's badge.
 *
 * The amount is the database's own for one piece (`store_offer_saving`: the percentage of the
 * price rounded to the fils, capped by the offer's `max_discount`); the order gets the offer that
 * saves most, as here. A fixed amount comes off the order once, not off each piece, so it never
 * lowers a card's price. Only live offers come here (`storefront_active_offers`), so an offer
 * shows from its start.
 */

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** An offer whose price a shopper pays on one piece, whatever else is in the cart. */
export function lowersThePrice(offer: StoreOffer): boolean {
  return (
    offer.kind === "discount" &&
    offer.discount_type === "percentage" &&
    Number(offer.discount_value) > 0 &&
    !(Number(offer.min_subtotal) > 0) &&
    !(Number(offer.min_items) > 1)
  );
}

/** What such an offer takes off one piece at this price (the database's rounding and cap). */
export function pieceSaving(offer: StoreOffer, price: number): number {
  if (!lowersThePrice(offer) || price <= 0) return 0;
  let saving = round3((price * Number(offer.discount_value)) / 100);
  if (offer.max_discount != null && Number(offer.max_discount) > 0) {
    saving = Math.min(saving, Number(offer.max_discount));
  }
  return Math.min(Math.max(saving, 0), price);
}

export type OfferBadge =
  | { kind: "discount"; percent: number; endsAt: string | null }
  | { kind: "offer"; endsAt: string | null };

export type OfferedCardPrice = CardPrice & {
  /** The badge a card wears for the store's offers (null: none reaches it). */
  offerBadge: OfferBadge | null;
};

type OfferedProduct = PricedProduct & { id: string; category?: string | null };

/** The best price-lowering offer for a piece: the one that saves most (the order takes it too). */
function bestPiece(
  offers: readonly StoreOffer[],
  product: OfferedProduct,
  variant: PricedVariant,
): { saving: number; offer: StoreOffer | null } {
  const price = sellingPrice(variant, product);
  let best = { saving: 0, offer: null as StoreOffer | null };
  for (const offer of offers) {
    if (!lowersThePrice(offer)) continue;
    if (
      !offerReaches(offer, {
        id: product.id,
        category: product.category ?? null,
        onSale: variantDiscounted(variant, product),
      })
    ) {
      continue;
    }
    const saving = pieceSaving(offer, price);
    if (saving > best.saving) best = { saving, offer };
  }
  return best;
}

/** What a piece of this variant costs after the store's offers (its price when none lowers it). */
export function offeredPiecePrice(
  offers: readonly StoreOffer[],
  product: OfferedProduct,
  variant: PricedVariant,
): { price: number; was: number | null; offer: StoreOffer | null } {
  const price = sellingPrice(variant, product);
  const { saving, offer } = bestPiece(offers, product, variant);
  if (saving <= 0)
    return {
      price,
      was: variantDiscounted(variant, product) ? Number(variant.original_price) : null,
      offer: null,
    };
  const before = Math.max(price, Number(variant.original_price) || 0);
  return { price: round3(price - saving), was: before, offer };
}

/**
 * A card's price with the store's offers: `cardPrice`, with each buyable variant at its offered
 * price, "was" the cheapest one's price before its own sale and the offer, and the badge.
 */
export function offeredCardPrice(
  product: OfferedProduct,
  variants: readonly PricedVariant[] | null | undefined,
  offers: readonly StoreOffer[] | null | undefined,
): OfferedCardPrice {
  const base = cardPrice(product, variants);
  const live = offers ?? [];
  if (live.length === 0) return { ...base, offerBadge: null };

  const priced = buyableVariants(product, variants).filter(
    (variant) => sellingPrice(variant, product) > 0,
  );
  const pieces = priced.map((variant) => offeredPiecePrice(live, product, variant));
  const lowered = pieces.filter((piece) => piece.offer);

  let result: CardPrice = base;
  if (lowered.length > 0) {
    const from = Math.min(...pieces.map((piece) => piece.price));
    const to = Math.max(...pieces.map((piece) => piece.price));
    const was = Math.max(
      0,
      ...pieces.filter((piece) => piece.price === from).map((piece) => piece.was ?? 0),
    );
    const discounted = was > from;
    result = {
      ...base,
      from,
      to,
      was: discounted ? was : null,
      percent: discounted ? Math.round(((was - from) / was) * 100) : null,
    };
  }

  const best = lowered
    .map((piece) => piece.offer!)
    .sort((a, b) => Number(b.discount_value) - Number(a.discount_value))[0];
  const reaches = (offer: StoreOffer) =>
    offerReaches(offer, {
      id: product.id,
      category: product.category ?? null,
      onSale: base.onSale,
    });
  const other = live.find(
    (offer) => offer.kind !== "free_delivery" && !lowersThePrice(offer) && reaches(offer),
  );
  const offerBadge: OfferBadge | null =
    best && result.percent
      ? { kind: "discount", percent: result.percent, endsAt: best.ends_at }
      : other
        ? { kind: "offer", endsAt: other.ends_at }
        : null;
  return { ...result, offerBadge };
}

/**
 * The product page's price with the store's offers, shown only: the cart keeps the price and the
 * checkout takes the offer off once (`apply_store_offers`). `price` is the chosen piece's price
 * (add-ons included, as an order line's), `was` its price before its own sale (0: none), and the
 * range the prices of the sizes still possible. Null when no offer lowers it.
 */
export function offeredShownPrice(
  offers: readonly StoreOffer[] | null | undefined,
  product: OfferedProduct,
  shown: { price: number; was: number; min: number; max: number; isRange: boolean },
): {
  price: number;
  min: number;
  max: number;
  was: number;
  percent: number;
  endsAt: string | null;
} | null {
  const onSale = shown.was > shown.price;
  const lowering = (offers ?? []).filter(
    (offer) =>
      lowersThePrice(offer) &&
      offerReaches(offer, { id: product.id, category: product.category ?? null, onSale }),
  );
  if (lowering.length === 0 || shown.price <= 0) return null;
  const at = (price: number) =>
    round3(price - Math.max(0, ...lowering.map((offer) => pieceSaving(offer, price))));
  const best = lowering.reduce((a, b) =>
    pieceSaving(b, shown.price) > pieceSaving(a, shown.price) ? b : a,
  );
  const price = at(shown.price);
  const was = Math.max(shown.was, shown.price);
  if (price >= was) return null;
  return {
    price,
    min: at(shown.min),
    max: at(shown.max),
    was,
    percent: Math.round(((was - price) / was) * 100),
    endsAt: best.ends_at,
  };
}
