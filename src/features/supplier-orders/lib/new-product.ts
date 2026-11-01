import { isDefaultSize } from "@/lib/default-variant";

/**
 * A product made from inside a supplier's order (a new collection that is not in the store yet):
 * its name, its sizes and, if known, its price. It goes into the inventory hidden from the store
 * until the merchant shows it, with no stock: receiving the order adds the pieces and their cost.
 */

export type NewProductForm = {
  nameAr: string;
  nameEn: string;
  sizes: string[];
  price: string;
};

export const emptyNewProduct = (): NewProductForm => ({
  nameAr: "",
  nameEn: "",
  sizes: [],
  price: "",
});

/** The most sizes offered in one tap. */
const USUAL_SIZES = 10;

/**
 * The sizes the store sells most, in the order it first used them: what a new product of the
 * same store is likely to come in. A one-size product's default variant has none.
 */
export function usualSizes(variants: ReadonlyArray<{ size: string | null }>): string[] {
  const seen = new Map<string, { count: number; first: number }>();
  variants.forEach((variant, index) => {
    const size = variant.size?.trim();
    if (!size || isDefaultSize(size)) return;
    const entry = seen.get(size) ?? { count: 0, first: index };
    entry.count += 1;
    seen.set(size, entry);
  });
  return [...seen.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, USUAL_SIZES)
    .sort((a, b) => a[1].first - b[1].first)
    .map(([size]) => size);
}

/** A size typed by hand, added once (the same size in another case is the same size). */
export function withSize(sizes: readonly string[], typed: string): string[] {
  const size = typed.trim().slice(0, 40);
  if (isDefaultSize(size)) return [...sizes];
  if (sizes.some((s) => s.toLocaleLowerCase() === size.toLocaleLowerCase())) return [...sizes];
  return [...sizes, size];
}

export type NewProductProblem = "name" | "price";

/** What stops the product being made: a name (in either language) and a price of 0 or more. */
export function newProductProblems(form: NewProductForm): NewProductProblem[] {
  const problems: NewProductProblem[] = [];
  if (!form.nameAr.trim() && !form.nameEn.trim()) problems.push("name");
  const price = form.price.trim();
  if (price && (!Number.isFinite(Number(price)) || Number(price) < 0)) problems.push("price");
  return problems;
}

/** The product's own columns: hidden from the store, sold from stock, at its price if given. */
export function newProductColumns(form: NewProductForm) {
  const nameAr = form.nameAr.trim().slice(0, 200);
  const nameEn = form.nameEn.trim().slice(0, 200);
  const price = form.price.trim() ? Math.round(Number(form.price) * 1000) / 1000 : 0;
  return {
    name: nameEn || nameAr,
    name_ar: nameAr || null,
    name_en: nameEn || null,
    base_price: price,
    is_active: false,
    is_made_to_order: false,
    item_kind: "product",
  };
}

/**
 * Its sizes, at its price and with no stock (receiving adds the pieces). With no size chosen it
 * is the default variant every product with no options has: no size at all.
 */
export function newProductSizes(form: NewProductForm) {
  const price = form.price.trim() ? Math.round(Number(form.price) * 1000) / 1000 : 0;
  const sizes: (string | null)[] = form.sizes.length ? form.sizes : [null];
  return sizes.map((size) => ({
    size,
    color: null,
    selling_price: price,
    cost_price: 0,
    stock_main: 0,
    stock_incubator: 0,
    stock: 0,
    sku: null,
    barcode: null,
    image_url: null,
  }));
}
