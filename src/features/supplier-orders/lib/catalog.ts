import { displayVariantParts } from "@/lib/variant-sku-utils";

/**
 * The store's products and sizes as a supplier's order names them: what can be ordered from a
 * supplier (pieces kept in stock, not a service or a package), each size in the store's own words,
 * and what each size holds and costs now.
 */

export type CatalogProduct = {
  id: string;
  name: string | null;
  name_ar: string | null;
  name_en: string | null;
  image_url: string | null;
  /** The product's regular selling price (sharing a bill by price reads it). */
  base_price?: number | null;
  /** What a piece costs the store (staff who may see costs only). */
  cost_price?: number | null;
  item_kind?: string | null;
  is_package?: boolean | null;
  tracks_inventory?: boolean | null;
};

export type CatalogVariant = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  size_unit?: string | null;
  color: string | null;
  fabric: string | null;
  option_four: string | null;
  option_five: string | null;
  stock_main: number | null;
  stock_incubator: number | null;
  cost_price?: number | null;
  created_at?: string | null;
};

export function productLabel(product: CatalogProduct | null | undefined, lang: "ar" | "en") {
  if (!product) return lang === "ar" ? "منتج محذوف" : "Deleted product";
  const name =
    lang === "ar"
      ? product.name_ar || product.name || product.name_en
      : product.name_en || product.name || product.name_ar;
  return name?.trim() || (lang === "ar" ? "منتج بلا اسم" : "Unnamed product");
}

/** A size's name: its options ("M / Black"), else its SKU, else "One size". */
export function sizeLabel(variant: CatalogVariant | null | undefined, lang: "ar" | "en") {
  if (!variant) return lang === "ar" ? "مقاس محذوف" : "Deleted size";
  const parts = displayVariantParts(variant, lang);
  if (parts.length) return parts.join(" / ");
  return variant.sku?.trim() || (lang === "ar" ? "مقاس واحد" : "One size");
}

/** A piece kept in stock: not a service, a package or a product that keeps no stock. */
export function isStockProduct(product: CatalogProduct) {
  return (
    product.item_kind !== "service" && !product.is_package && product.tracks_inventory !== false
  );
}

/** Each product's sizes, in the order they were added. */
export function sizesByProduct(variants: readonly CatalogVariant[]) {
  const map = new Map<string, CatalogVariant[]>();
  for (const variant of variants) {
    const list = map.get(variant.product_id) ?? [];
    list.push(variant);
    map.set(variant.product_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  }
  return map;
}

/** What each size holds (the store's and the partners') and costs now. */
export function shelfOf(variants: readonly CatalogVariant[]) {
  return new Map(
    variants.map((v) => [
      v.id,
      {
        onHand: Math.max(0, (v.stock_main ?? 0) + (v.stock_incubator ?? 0)),
        cost: Number(v.cost_price ?? 0) || 0,
      },
    ]),
  );
}

const fold = (text: string) => text.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");

/** The products a search finds, by a name in either language or a size's SKU. */
export function searchProducts(
  products: readonly CatalogProduct[],
  sizes: ReadonlyMap<string, CatalogVariant[]>,
  query: string,
) {
  const wanted = fold(query.trim());
  const stock = products.filter(isStockProduct);
  if (!wanted) return stock;
  return stock.filter((product) => {
    const names = [product.name, product.name_ar, product.name_en].filter(Boolean) as string[];
    if (names.some((name) => fold(name).includes(wanted))) return true;
    return (sizes.get(product.id) ?? []).some((v) => v.sku && fold(v.sku).includes(wanted));
  });
}
