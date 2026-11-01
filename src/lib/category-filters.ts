import type { ProductRow } from "@/lib/data/storefront";
import { formatDuration } from "@/lib/bookings/format";
import { formatSizeWithUnit } from "@/lib/format";
import type { CatalogSort } from "@/lib/catalog-sort";
import { resolveColorHex } from "@/lib/color-names";
import { isDefaultSize } from "@/lib/default-variant";
import { OCCASION_CHOICES } from "@/lib/product-occasion";
import { factValues, filterableFacts } from "@/lib/product-facts";

/**
 * A category listing's filters. Sizes and colours are multi-select (a shopper who takes a 52 or a
 * 54, in black or navy), and a product passes only when ONE of its variants satisfies every
 * choice at once: a size-54 variant in blue and a size-52 one in black is not a "54 in black".
 */
export type FilterState = {
  sizes: string[];
  colors: string[];
  /** What the product is for (`products.occasion`): a product-level choice, not a variant's. */
  occasions: string[];
  /** The store's facts picked (`?f_roast=light`), each a product-level choice like occasion. */
  facts: Record<string, string[]>;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  sort: CatalogSort;
};

export const EMPTY_FILTERS: FilterState = {
  sizes: [],
  colors: [],
  occasions: [],
  facts: {},
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  sort: "new",
};

type Variant = ProductRow["product_variants"][number];

const SORTS: readonly CatalogSort[] = ["new", "old", "price-low", "price-high", "best"];

const norm = (value: string | null | undefined) => (value ?? "").trim();
const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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
    occasions: listParam(sp, "occasion"),
    facts: factsFromSearch(sp),
    minPrice: numberParam(sp.get("min")),
    maxPrice: numberParam(sp.get("max")),
    inStockOnly: sp.get("stock") === "1",
    sort: sort && SORTS.includes(sort) ? sort : "new",
  };
}

const FACT_PREFIX = "f_";
const FACT_PARAM = /^f_[a-z][a-z_]{0,39}$/;

function factsFromSearch(sp: URLSearchParams): Record<string, string[]> {
  const facts: Record<string, string[]> = {};
  for (const key of new Set(sp.keys())) {
    if (!FACT_PARAM.test(key)) continue;
    const values = listParam(sp, key);
    if (values.length) facts[key.slice(FACT_PREFIX.length)] = values;
  }
  return facts;
}

/** The address's query with these filters in it, every other parameter left as it was. */
export function filtersToSearch(search: string, filters: FilterState): string {
  const sp = new URLSearchParams(search);
  for (const key of ["size", "color", "occasion", "min", "max", "stock", "sort"]) sp.delete(key);
  for (const key of [...sp.keys()]) if (FACT_PARAM.test(key)) sp.delete(key);
  for (const [key, values] of Object.entries(filters.facts)) {
    values.forEach((value) => sp.append(`${FACT_PREFIX}${key}`, value));
  }
  filters.sizes.forEach((size) => sp.append("size", size));
  filters.colors.forEach((color) => sp.append("color", color));
  filters.occasions.forEach((occasion) => sp.append("occasion", occasion));
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
    filters.occasions.length > 0,
    ...Object.values(filters.facts).map((values) => values.length > 0),
    filters.minPrice !== null,
    filters.maxPrice !== null,
    filters.inStockOnly,
  ].filter(Boolean).length;
}

type Skip = "size" | "color" | "occasion" | `fact:${string}`;

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

/** The editor's order (daily, evening...), then any other word as written. */
const occasionRank = (value: string) => {
  const i = OCCASION_CHOICES.findIndex((choice) => choice.value === value);
  return i < 0 ? OCCASION_CHOICES.length : i;
};
const byOccasionOrder = (a: string, b: string) =>
  occasionRank(a) - occasionRank(b) || a.localeCompare(b);

/**
 * The product-level choices: an occasion picked, and each fact picked (a product with one of the
 * values picked passes; nothing picked: any). `skip` leaves one out, to count its own options.
 */
function productLevelMeets(product: ProductRow, filters: FilterState, skip?: Skip): boolean {
  if (
    skip !== "occasion" &&
    filters.occasions.length > 0 &&
    !filters.occasions.includes(norm(product.occasion))
  ) {
    return false;
  }
  return Object.entries(filters.facts).every(
    ([key, picked]) =>
      skip === `fact:${key}` ||
      picked.length === 0 ||
      factValues(product.details, key).some((value) => picked.includes(value)),
  );
}

function productMeets(product: ProductRow, filters: FilterState, skip?: Skip): boolean {
  if (!productLevelMeets(product, filters, skip)) return false;
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

export type SizeFacet = {
  value: string;
  unit: string | null;
  /** A service's length, when the size is one (`duration_minutes`): it is named from this. */
  minutes: number | null;
  count: number;
};
export type ColorFacet = { name: string; hex: string | null; count: number };
export type OccasionFacet = { value: string; count: number };
/** A fact of the store's set a listing can filter by, with the values its products have. */
export type FactFacet = { key: string; options: Array<{ value: string; count: number }> };
export type CatalogFacets = {
  sizes: SizeFacet[];
  colors: ColorFacet[];
  /** Offered only when a product on the page has one. */
  occasions: OccasionFacet[];
  /** The store's filterable facts (`filterableFacts`) that a product on the page has. */
  facts: FactFacet[];
  /** The lowest and highest price in these products (whole numbers), before any price filter. */
  price: { min: number; max: number };
};

/**
 * What a shopper can pick, from the products of the page they are on. Each option counts the
 * products that would show if it were picked given every OTHER filter, so one that would leave
 * nothing reads 0. The default variant's size names nothing and is never offered.
 */
export function catalogFacets(
  products: readonly ProductRow[],
  filters: FilterState,
  vertical?: string | null,
): CatalogFacets {
  const sizeValues = new Map<string, { unit: string | null; minutes: number | null }>();
  const colorValues = new Map<string, { name: string; hex: string | null }>();
  const prices: number[] = [];
  const occasionValues = new Set<string>();
  for (const product of products) {
    const occasion = norm(product.occasion);
    if (occasion) occasionValues.add(occasion);
    for (const variant of product.product_variants ?? []) {
      const size = norm(variant.size);
      if (!isDefaultSize(size) && !sizeValues.has(size)) {
        const minutes = Number(variant.duration_minutes ?? 0);
        sizeValues.set(size, {
          unit: variant.size_unit ?? null,
          minutes: minutes > 0 ? minutes : null,
        });
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
    products.filter(
      (product) =>
        productLevelMeets(product, filters) &&
        (product.product_variants ?? []).some(
          (variant) => matches(variant) && variantMeets(product, variant, filters, skip),
        ),
    ).length;

  return {
    sizes: [...sizeValues.entries()]
      .map(([value, { unit, minutes }]) => ({
        value,
        unit,
        minutes,
        count: countFor("size", (variant) => norm(variant.size) === value),
      }))
      // Lengths by how long they are; other sizes as a shopper expects them.
      .sort((a, b) =>
        a.minutes !== null && b.minutes !== null
          ? a.minutes - b.minutes
          : compareSizes(a.value, b.value),
      ),
    colors: [...colorValues.values()].map(({ name, hex }) => ({
      name,
      hex,
      count: countFor("color", (variant) => sameColor(norm(variant.color), name)),
    })),
    occasions: [...occasionValues].sort(byOccasionOrder).map((value) => ({
      value,
      count: products.filter(
        (product) => norm(product.occasion) === value && productMeets(product, filters, "occasion"),
      ).length,
    })),
    facts: filterableFacts(vertical)
      .map((field) => ({
        key: field.key,
        // In the set's order; a value the set does not offer is not a filter.
        options: (field.choices ?? [])
          .map((choice) => ({
            value: choice.value,
            count: products.filter(
              (product) =>
                factValues(product.details, field.key).includes(choice.value) &&
                productMeets(product, filters, `fact:${field.key}`),
            ).length,
          }))
          .filter((option) =>
            products.some((product) =>
              factValues(product.details, field.key).includes(option.value),
            ),
          ),
      }))
      .filter((facet) => facet.options.length > 0),
    price: prices.length
      ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
      : { min: 0, max: 0 },
  };
}

/**
 * A size chip's words in the shopper's language: a service's length from its minutes ("3 ساعات",
 * "3 hours"), else the size with its unit. A length named from the variant's own text came out in
 * whichever language the store typed it ("3 hours" on an Arabic page).
 */
export function sizeChipLabel(facet: SizeFacet, lang: "ar" | "en"): string {
  if (facet.minutes) return formatDuration(facet.minutes, lang === "ar");
  return formatSizeWithUnit(facet.value, facet.unit ?? undefined, lang) || facet.value;
}

/**
 * How wide a size chip's column is: as wide as the longest label needs, so every chip is the same
 * width and no label runs out of its chip. A column sized for "S" and "52" (2.5rem) cut
 * "3 ساعات" and "Free size" off at its edges.
 */
export function sizeChipColumn(labels: readonly string[]): string {
  const longest = labels.reduce((most, label) => Math.max(most, [...label].length), 0);
  // About half a rem a character at the chip's text size, plus its padding; never under 2.5rem.
  const rem = Math.min(12, Math.max(2.5, Math.ceil((longest * 0.55 + 1.5) * 4) / 4));
  return `${rem}rem`;
}
