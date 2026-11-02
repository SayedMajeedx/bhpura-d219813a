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

// Choosing its sizes is the product editor's rule too.
export { usualSizes, withSize } from "@/lib/size-choices";

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
