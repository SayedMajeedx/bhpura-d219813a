import {
  madeToOrderLimit,
  readyUnitsOf,
  type AvailabilityProduct,
  type AvailabilityVariant,
} from "@/lib/product-availability";

/**
 * What a product's card says about its price, and whether the product is on sale: the one rule
 * every storefront card, rail, search result and the sale collection read.
 *
 * Prices live on variants (`selling_price`, and `original_price` as the price before a
 * discount); `products` has no `original_price`. A card once read `product.original_price`, so
 * no new-look card ever showed a sale, while the sale rail chose products by their variants.
 *
 * Only what a shopper can buy now is advertised: a variant with ready pieces, or any variant of
 * a product that is made to order (while making it is open) or a service. A size that is out of
 * stock neither sets the "from" price nor puts the product on sale. When nothing can be bought,
 * every variant counts (the card says it is out of stock).
 *
 * A discount is the variant's own: "from 23, was 30, -23%" is shown only when the cheapest
 * buyable price is itself discounted. A product whose dearer size alone is discounted is still on
 * sale, but its card cannot strike through a "from" price that was never higher.
 */

export type PricedVariant = AvailabilityVariant & {
  selling_price?: number | string | null;
  /** Some older shapes call the selling price `price`. */
  price?: number | string | null;
  original_price?: number | string | null;
};

export type PricedProduct = AvailabilityProduct & {
  base_price?: number | string | null;
};

export type CardPrice = {
  /** The lowest price a shopper can pay now (0 when the product has no price). */
  from: number;
  /** The highest; equal to `from` when every buyable variant costs the same. */
  to: number;
  /** The price before the discount of the `from` variant; null when `from` is not discounted. */
  was: number | null;
  /** The discount of the `from` variant in whole percent; null with `was`. */
  percent: number | null;
  /** A variant a shopper can buy now is priced below its own original price. */
  onSale: boolean;
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sellingPrice = (variant: PricedVariant, product: PricedProduct) =>
  num(variant.selling_price ?? variant.price ?? product.base_price);

/** The variant is priced below its own original price. */
export function variantDiscounted(variant: PricedVariant, product: PricedProduct = {}): boolean {
  const selling = sellingPrice(variant, product);
  return selling > 0 && num(variant.original_price) > selling;
}

/** The variants a shopper can buy now (all of them when none can be: the card says it is out). */
export function buyableVariants<V extends PricedVariant>(
  product: PricedProduct,
  variants: readonly V[] | null | undefined,
): V[] {
  const list = [...(variants ?? [])];
  const madeWhenOrdered =
    product.item_kind === "service" ||
    (Boolean(product.is_made_to_order) && !madeToOrderLimit(product).closed);
  if (madeWhenOrdered) return list;
  const inStock = list.filter((variant) => readyUnitsOf([variant]) > 0);
  return inStock.length > 0 ? inStock : list;
}

/** The price a card shows for a product, from the variants a shopper can buy now. */
export function cardPrice(
  product: PricedProduct,
  variants: readonly PricedVariant[] | null | undefined,
): CardPrice {
  const priced = buyableVariants(product, variants).filter(
    (variant) => sellingPrice(variant, product) > 0,
  );
  if (priced.length === 0) {
    const base = Math.max(0, num(product.base_price));
    return { from: base, to: base, was: null, percent: null, onSale: false };
  }
  const prices = priced.map((variant) => sellingPrice(variant, product));
  const from = Math.min(...prices);
  const to = Math.max(...prices);
  const was = Math.max(
    0,
    ...priced
      .filter((variant) => sellingPrice(variant, product) === from)
      .map((variant) => num(variant.original_price)),
  );
  const discounted = was > from;
  return {
    from,
    to,
    was: discounted ? was : null,
    percent: discounted ? Math.round(((was - from) / was) * 100) : null,
    onSale: priced.some((variant) => variantDiscounted(variant, product)),
  };
}

/** Whether the product belongs on the sale rail and in the sale collection. */
export function productOnSale(
  product: PricedProduct & { product_variants?: readonly PricedVariant[] | null },
): boolean {
  return cardPrice(product, product.product_variants).onSale;
}
