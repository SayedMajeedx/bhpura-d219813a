import type { ProductRow } from "@/lib/data/storefront";
import type { CatalogSort } from "@/lib/catalog-sort";
import { resolveColorHex } from "@/lib/color-names";
import { PLACEHOLDER_SIZE_VALUES } from "@/lib/variant-sku-utils";

/**
 * A category listing's filters. Sizes and colours are multi-select (a shopper who takes a 52 or a
 * 54, in black or navy), and a product passes only when ONE of its variants satisfies every
 * choice at once: a size-54 variant in blue and a size-52 one in black is not a "54 in black".
 */
export type FilterState = {
  sizes: string[];
  colors: string[];
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  sort: CatalogSort;
};

export const EMPTY_FILTERS: FilterState = {
  sizes: [],
  colors: [],
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  sort: "new",
};

type Variant = ProductRow["product_variants"][number];

const SORTS: readonly CatalogSort[] = ["new", "old", "price-low", "price-high", "best"];

const norm = (value: string | null | undefined) => (value ?? "").trim();
const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isPlaceholderSize = (size: string) =>
  (PLACEHOLDER_SIZE_VALUES as readonly string[]).includes(size);

const numberParam = (value: string | null) => {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const listParam = (sp: URLSearchParams, key: string) =>
  Array.from(new Set(sp.getAll(key).map(norm).filter(Boolean)));

/** The filters a listing's address carries (`?size=52&size=54&color=Black&min=10&stock=1`). */
export function filtersFromSearch(search: string): FilterState {
  const sp = new URLSearchParams(search);
  const sort = sp.get("sort") as CatalogSort | null;
  return {
    sizes: listParam(sp, "size"),
    colors: listParam(sp, "color"),
    minPrice: numberParam(sp.get("min")),
    maxPrice: numberParam(sp.get("max")),
    inStockOnly: sp.get("stock") === "1",
    sort: sort && SORTS.includes(sort) ? sort : "new",
  };
}

/** The address's query with these filters in it, every other parameter left as it was. */
export function filtersToSearch(search: string, filters: FilterState): string {
  const sp = new URLSearchParams(search);
  for (const key of ["size", "color", "min", "max", "stock", "sort"]) sp.delete(key);
  filters.sizes.forEach((size) => sp.append("size", size));
  filters.colors.forEach((color) => sp.append("color", color));
  if (filters.minPrice !== null) sp.set("min", String(filters.minPrice));
  if (filters.maxPrice !== null) sp.set("max", String(filters.maxPrice));
  if (filters.inStockOnly) sp.set("stock", "1");
  if (filters.sort !== "new") sp.set("sort", filters.sort);
  return sp.toString();
}

/** How many filters are on (a facet counts once, however many values it holds). */
export function activeFilterCount(filters: FilterState): number {
  return [
    filters.sizes.length > 0,
    filters.colors.length > 0,
    filters.minPrice !== null,
    filters.maxPrice !== null,
    filters.inStockOnly,
  ].filter(Boolean).length;
}

type Skip = "size" | "color";

/** Whether this variant meets the filters (leaving one facet out when asked). */
function variantMeets(
  product: ProductRow,
  variant: Variant,
  filters: FilterState,
  skip?: Skip,
): boolean {
  if (skip !== "size" && filters.sizes.length > 0 && !filters.sizes.includes(norm(variant.size))) {
    return false;
  }
  if (
    skip !== "color" &&
    filters.colors.length > 0 &&
    !filters.colors.some((color) => sameColor(color, norm(variant.color)))
  ) {
    return false;
  }
  const price = Number(variant.selling_price || 0);
  if (filters.minPrice !== null && price < filters.minPrice) return false;
  if (filters.maxPrice !== null && price > filters.maxPrice) return false;
  if (filters.inStockOnly) {
    // Made-to-order products and services are always orderable.
    const orderable =
      product.is_made_to_order ||
      product.item_kind === "service" ||
      Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0) > 0;
    if (!orderable) return false;
  }
  return true;
}

function productMeets(product: ProductRow, filters: FilterState, skip?: Skip): boolean {
  const variants = product.product_variants ?? [];
  if (variants.length === 0) {
    // Nothing to match a size, a colour or a price against.
    return (
      (skip === "size" || filters.sizes.length === 0) &&
      (skip === "color" || filters.colors.length === 0) &&
      filters.minPrice === null &&
      filters.maxPrice === null &&
      (!filters.inStockOnly || Boolean(product.is_made_to_order || product.item_kind === "service"))
    );
  }
  return variants.some((variant) => variantMeets(product, variant, filters, skip));
}

/** The products that pass every filter, in the order given (the sort is the caller's). */
export function filterProducts(products: readonly ProductRow[], filters: FilterState) {
  return products.filter((product) => productMeets(product, filters));
}

/** Sizes in the order a shopper expects: numbers by value, then letter sizes, then the rest. */
const LETTER_SIZES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];
export function compareSizes(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const aNumeric = a.trim() !== "" && Number.isFinite(na);
  const bNumeric = b.trim() !== "" && Number.isFinite(nb);
  if (aNumeric && bNumeric) return na - nb;
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  const la = LETTER_SIZES.indexOf(a.trim().toUpperCase());
  const lb = LETTER_SIZES.indexOf(b.trim().toUpperCase());
  if (la >= 0 && lb >= 0) return la - lb;
  if (la >= 0 !== lb >= 0) return la >= 0 ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export type SizeFacet = { value: string; unit: string | null; count: number };
export type ColorFacet = { name: string; hex: string | null; count: number };
export type CatalogFacets = {
  sizes: SizeFacet[];
  colors: ColorFacet[];
  /** The lowest and highest price in these products (whole numbers), before any price filter. */
  price: { min: number; max: number };
};

/**
 * What a shopper can pick, from the products of the page they are on. Each option counts the
 * products that would show if it were picked given every OTHER filter, so one that would leave
 * nothing reads 0. A "Standard" placeholder is not a size and is never offered.
 */
export function catalogFacets(
  products: readonly ProductRow[],
  filters: FilterState,
): CatalogFacets {
  const sizeValues = new Map<string, string | null>();
  const colorValues = new Map<string, { name: string; hex: string | null }>();
  const prices: number[] = [];
  for (const product of products) {
    for (const variant of product.product_variants ?? []) {
      const size = norm(variant.size);
      if (size && !isPlaceholderSize(size) && !sizeValues.has(size)) {
        sizeValues.set(size, variant.size_unit ?? null);
      }
      const color = norm(variant.color);
      if (color && !colorValues.has(color.toLowerCase())) {
        colorValues.set(color.toLowerCase(), { name: color, hex: resolveColorHex(color) });
      }
      const price = Number(variant.selling_price || 0);
      if (price > 0) prices.push(price);
    }
  }

  const countFor = (skip: Skip, matches: (variant: Variant) => boolean) =>
    products.filter((product) =>
      (product.product_variants ?? []).some(
        (variant) => matches(variant) && variantMeets(product, variant, filters, skip),
      ),
    ).length;

  return {
    sizes: [...sizeValues.entries()]
      .map(([value, unit]) => ({
        value,
        unit,
        count: countFor("size", (variant) => norm(variant.size) === value),
      }))
      .sort((a, b) => compareSizes(a.value, b.value)),
    colors: [...colorValues.values()].map(({ name, hex }) => ({
      name,
      hex,
      count: countFor("color", (variant) => sameColor(norm(variant.color), name)),
    })),
    price: prices.length
      ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
      : { min: 0, max: 0 },
  };
}
