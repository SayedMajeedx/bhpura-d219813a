/**
 * The default variant: what a product with no options is sold as. A product's price, stock,
 * stock history, cost and order lines all live on a variant, so a product with no sizes or
 * colours still has one, with no option value at all. It is never a choice, a size or a label.
 *
 * Before 2026-11 the editor wrote a word into its size ("قياسي" on an Arabic admin, "Standard"
 * on an English one). Rows written then, and the orders that carry them in their snapshot, are
 * read the same way: that word names no size.
 */

type VariantOptions = {
  size?: string | null;
  color?: string | null;
  fabric?: string | null;
  option_four?: string | null;
  option_five?: string | null;
};

const LEGACY_DEFAULT_SIZES = ["قياسي", "standard"];

/** Words a store writes for its only size: a real size, but nothing worth naming in a message. */
const ONE_SIZE_WORDS = ["one size", "مقاس واحد"];

const blank = (value: string | null | undefined) => !value || !value.trim();

/** A size that names nothing: empty, or the word the editor once wrote for a product with no sizes. */
export function isDefaultSize(size: string | null | undefined): boolean {
  return blank(size) || LEGACY_DEFAULT_SIZES.includes(size!.trim().toLowerCase());
}

/** The size to show, offer, filter on or print: null when it names nothing. */
export function realSize(size: string | null | undefined): string | null {
  return isDefaultSize(size) ? null : size!.trim();
}

/** The size to name to a customer in a message: null for no size and for "one size". */
export function sizeWorthNaming(size: string | null | undefined): string | null {
  const real = realSize(size);
  return real && !ONE_SIZE_WORDS.includes(real.toLowerCase()) ? real : null;
}

/** The variant a product with no options is sold as: no option value, its size aside. */
export function isDefaultVariant(variant: VariantOptions | null | undefined): boolean {
  if (!variant) return false;
  return (
    isDefaultSize(variant.size) &&
    blank(variant.color) &&
    blank(variant.fabric) &&
    blank(variant.option_four) &&
    blank(variant.option_five)
  );
}

/** How staff read the default variant where a list needs a word for it. */
export function defaultVariantLabel(lang: "ar" | "en"): string {
  return lang === "ar" ? "بدون خيارات" : "No options";
}
