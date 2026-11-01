/**
 * The product page's bundle ("Complete your order"): the piece on the page
 * and a second one, added together in one tap. One tap may add only what the
 * shopper chose and what can be bought, the rule the cards' quick add follows
 * (quickAddPlan). The bundle once added the main piece in whatever
 * variant the page held (out of stock, or a size never picked) and the second
 * piece in its first variant (another size), whatever the shopper wore.
 */

type StockedVariant = {
  id: string;
  size?: string | null;
  stock_main?: number | string | null;
  stock_incubator?: number | string | null;
};

type BundleProduct = {
  is_made_to_order?: boolean | null;
  custom_fields?: unknown;
  product_variants?: readonly StockedVariant[] | null;
};

const units = (v: StockedVariant) => Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0);

/**
 * Why the bundle cannot be added yet, or null when it can:
 * - "choose": the shopper has not chosen the piece's options yet;
 * - "out": the chosen variant has no piece (the page offers "notify me");
 * - "made_to_order": it is being made to order, with details only the page takes.
 */
export type BundleBlock = "choose" | "out" | "made_to_order";

export function bundleBlock({
  mainProduct,
  mainVariant,
  madeToOrderChoice,
}: {
  mainProduct: BundleProduct;
  mainVariant: StockedVariant | null | undefined;
  madeToOrderChoice: boolean;
}): BundleBlock | null {
  if (madeToOrderChoice) return "made_to_order";
  const variants = mainProduct.product_variants ?? [];
  if (variants.length > 0 && !mainVariant) return "choose";
  if (mainVariant && units(mainVariant) <= 0) return "out";
  return null;
}

/**
 * The variant a bundle adds of a second piece, or null when one tap cannot
 * name it: a piece made to order or with details to fill needs its own page;
 * a piece with one variant is that variant, in stock; a piece in several is
 * the size the shopper chose for the main one, when exactly one in stock has it.
 */
export function companionVariant<V extends StockedVariant>(
  item: {
    is_made_to_order?: boolean | null;
    custom_fields?: unknown;
    product_variants?: readonly V[] | null;
  },
  mainVariant: StockedVariant | null | undefined,
): V | null {
  if (item.is_made_to_order) return null;
  if (Array.isArray(item.custom_fields) && item.custom_fields.length > 0) return null;
  const variants = item.product_variants ?? [];
  const stocked = variants.filter((v) => units(v) > 0);
  if (variants.length === 1) return stocked[0] ?? null;
  const size = mainVariant?.size?.trim();
  if (!size) return null;
  const sameSize = stocked.filter((v) => (v.size ?? "").trim() === size);
  return sameSize.length === 1 ? sameSize[0] : null;
}
