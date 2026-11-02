import { isDefaultVariant } from "@/lib/default-variant";
import { arNoun, countOf } from "@/lib/arabic-count";

/**
 * Adding sizes to a product sold so far as its default variant (no options,
 * `src/lib/default-variant.ts`). The default is never left beside the new sizes, where it
 * read as a size of its own:
 *
 * - it holds pieces: it becomes one of the new sizes (the merchant says which), keeping its
 *   pieces, its stock history, its cost and its orders;
 * - it holds none: the new sizes are added first, then it is removed (archived when it has a
 *   history, `remove_product_variants`), so the product always keeps a size.
 *
 * A product that already has real sizes just takes the new ones.
 */

type SizedVariant = {
  id: string;
  size?: string | null;
  color?: string | null;
  fabric?: string | null;
  option_four?: string | null;
  option_five?: string | null;
  stock_main?: number | null;
  stock_incubator?: number | null;
};

export type FirstSizes =
  | { kind: "add" }
  | { kind: "replace"; defaultId: string }
  | { kind: "become"; defaultId: string; pieces: number };

/** What adding sizes does, given the product's sizes in use. */
export function firstSizes(variants: readonly SizedVariant[]): FirstSizes {
  if (variants.length !== 1 || !isDefaultVariant(variants[0])) return { kind: "add" };
  const only = variants[0];
  const pieces =
    Math.max(0, Number(only.stock_main ?? 0)) + Math.max(0, Number(only.stock_incubator ?? 0));
  return pieces > 0
    ? { kind: "become", defaultId: only.id, pieces }
    : { kind: "replace", defaultId: only.id };
}

type NewSizeValues = {
  size: string | null;
  size_unit: string | null;
  color: string | null;
  fabric: string | null;
  option_four: string | null;
  option_five: string | null;
  sku: string | null;
  barcode: string | null;
  selling_price: number;
  original_price: number | null;
  image_url?: string | null;
  cost_price?: number;
  stock_main?: number;
  stock_incubator?: number;
  stock?: number;
};

/**
 * The columns the default takes when it becomes a size: the size's options, codes and prices.
 * Never its stock (its pieces stay, and a change of count goes through the ledger) nor its cost
 * (its own, perhaps set by receiving a supplier's order).
 */
export function becomePatch(values: NewSizeValues) {
  return {
    size: values.size,
    size_unit: values.size_unit,
    color: values.color,
    fabric: values.fabric,
    option_four: values.option_four,
    option_five: values.option_five,
    sku: values.sku,
    barcode: values.barcode,
    selling_price: values.selling_price,
    original_price: values.original_price,
    ...(values.image_url !== undefined ? { image_url: values.image_url } : {}),
  };
}

/** What staff read once the default's pieces became a size. */
export function becameMessage(pieces: number, sizeName: string, isAr: boolean): string {
  return isAr
    ? `القطع الموجودة أصبحت من هذا الخيار: ${sizeName} (${arNoun(pieces, "piece")}).`
    : `Your ${countOf(pieces, "piece", "en")} in stock are now ${sizeName}.`;
}

/** When the new sizes were added but the default could not be removed after them. */
export function leftoverMessage(isAr: boolean): string {
  return isAr
    ? "أُضيفت الخيارات، لكن تعذّر حذف سطر «بدون خيارات». احذفه من الجدول."
    : 'The sizes were added, but the "No options" line could not be removed. Remove it from the table.';
}

/** The question the bulk dialog asks when the default holds pieces. */
export function piecesQuestion(pieces: number, isAr: boolean): string {
  return isAr
    ? `لديك قطع في المخزون بدون خيارات (${arNoun(pieces, "piece")}). من أي خيار هي؟`
    : `You have ${countOf(pieces, "piece", "en")} in stock with no options. Which size are they?`;
}

/** Under that question: the chosen size keeps those pieces, whatever its row says. */
export function piecesHint(isAr: boolean): string {
  return isAr
    ? "يحتفظ الخيار المختار بهذه القطع وسجلّها، ولا تُضاف إليها الكمية المكتوبة في سطره."
    : "The size you choose keeps these pieces and their history; the quantity on its row is not added to them.";
}
