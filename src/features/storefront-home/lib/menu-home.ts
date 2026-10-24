import type { ProductRow, StorefrontVariant } from "@/lib/data/storefront";
import { variantSellable, type AvailabilityProduct } from "@/lib/product-availability";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import {
  matchingVariantsFor,
  type VariantSelection,
} from "@/features/product-page/lib/variant-options";

/**
 * The menu home page of a store that sells by quick order (a bakery, a roastery, a kitchen: the
 * `menu` home layout, `storefrontHomeLayout`). A shopper knows what they want and wants it in the
 * basket fast: the store's categories as sections with tabs, each item as a row with its price
 * and one button, the items they ordered before, and the basket always in reach. Pure rules here;
 * the page is `MenuHome`.
 */

type Category = { slug: string; name_ar?: string | null; name_en?: string | null };

/** A variant as the home page's products carry it (the cards' columns). */
export type MenuVariant = NonNullable<ProductRow["product_variants"]>[number];

export type MenuSection = { id: string; title: string; products: ProductRow[] };

/**
 * The menu's sections: the store's categories in their own order, each with its products, then
 * what is filed under no category (or one the store no longer has) as "More", or as "Our menu"
 * when nothing is filed at all. A category with no product is left out.
 */
export function menuSections(
  products: readonly ProductRow[],
  categories: readonly Category[],
  isAr: boolean,
): MenuSection[] {
  const known = new Set(categories.map((c) => c.slug));
  const sections: MenuSection[] = categories
    .map((category) => ({
      id: `menu-${category.slug}`,
      title:
        (isAr ? category.name_ar || category.name_en : category.name_en || category.name_ar) ??
        category.slug,
      products: products.filter((p) => p.category === category.slug),
    }))
    .filter((section) => section.products.length > 0);
  const rest = products.filter((p) => !p.category || !known.has(p.category));
  if (rest.length > 0) {
    sections.push({
      id: "menu-more",
      title: sections.length === 0 ? (isAr ? "قائمتنا" : "Our menu") : isAr ? "المزيد" : "More",
      products: rest,
    });
  }
  return sections;
}

/** The variants a shopper can buy now (`variantSellable`, the cards' own rule). */
export const sellableVariants = (product: ProductRow): MenuVariant[] =>
  (product.product_variants ?? []).filter((v) => variantSellable(product, v));

/**
 * What an item's button does:
 * - `add`: one variant to buy, added at once (then a quantity stepper);
 * - `choose`: several, chosen in a sheet (weight, flavour...);
 * - `details`: made to order or with the customer's own details, so it opens its page;
 * - `sold_out`: nothing to buy now.
 */
export type MenuItemAction =
  | { kind: "add"; variant: MenuVariant }
  | { kind: "choose" }
  | { kind: "details" }
  | { kind: "sold_out" };

export function menuItemAction(product: ProductRow): MenuItemAction {
  const custom = Array.isArray(product.custom_fields) && product.custom_fields.length > 0;
  if (product.is_made_to_order || custom) return { kind: "details" };
  const sellable = sellableVariants(product);
  if (sellable.length === 0) return { kind: "sold_out" };
  if ((product.product_variants ?? []).length === 1) return { kind: "add", variant: sellable[0] };
  return { kind: "choose" };
}

/**
 * The basket line for a menu item's variant. Only an item with no details of the customer's own
 * is added from the menu (`menuItemAction` sends the others to their page), so it carries none.
 */
export function menuCartLine(product: ProductRow, variant: MenuVariant, qty = 1) {
  return buildCartItem({ product: { ...product, custom_fields: null }, variant, qty });
}

/** The item's price on the menu: one price, or "from" the cheapest a shopper can buy. */
export function menuPrice(product: ProductRow): { amount: number; from: boolean } | null {
  const prices = sellableVariants(product)
    .map((v) => Number(v.selling_price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return null;
  const amount = Math.min(...prices);
  return { amount, from: prices.some((p) => p !== amount) };
}

type PastOrder = {
  order_date?: string | null;
  status?: string | null;
  order_items?: ReadonlyArray<{ product_id?: string | null; variant_id?: string | null }> | null;
};

export type OrderAgainItem = { product: ProductRow; variant: MenuVariant };

/**
 * "Order again": what the signed-in shopper ordered before that can be bought now, as the exact
 * variant they had, most recent first, each once, at most `limit`. A cancelled order says
 * nothing about what they like.
 */
export function orderAgainItems(
  orders: readonly PastOrder[],
  products: readonly ProductRow[],
  limit = 8,
): OrderAgainItem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: OrderAgainItem[] = [];
  const recent = [...orders]
    .filter((o) => !/cancel/i.test(String(o.status ?? "")))
    .sort((a, b) => String(b.order_date ?? "").localeCompare(String(a.order_date ?? "")));
  for (const order of recent) {
    for (const line of order.order_items ?? []) {
      const product = line.product_id ? byId.get(line.product_id) : undefined;
      if (!product || menuItemAction(product).kind === "details") continue;
      const variant = (product.product_variants ?? []).find((v) => v.id === line.variant_id);
      if (!variant || !variantSellable(product, variant) || seen.has(variant.id)) continue;
      seen.add(variant.id);
      out.push({ product, variant });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** How many of a variant the basket holds (its plain lines, not one with the customer's details). */
export function basketQty(
  cart: ReadonlyArray<{ variant_id: string | null; qty: number; custom_fields?: unknown[] }>,
  variantId: string,
): number {
  return cart
    .filter(
      (line) =>
        line.variant_id === variantId &&
        !(Array.isArray(line.custom_fields) && line.custom_fields.length > 0),
    )
    .reduce((sum, line) => sum + line.qty, 0);
}

/**
 * Whether a value of one option can still be picked: some variant a shopper can buy carries it
 * with the other options chosen so far.
 */
export function valueOpen(
  product: AvailabilityProduct,
  variants: StorefrontVariant[],
  axis: keyof VariantSelection,
  value: string,
  selection: VariantSelection,
): boolean {
  return matchingVariantsFor(variants, { ...selection, [axis]: value }).some((v) =>
    variantSellable(product, v),
  );
}
