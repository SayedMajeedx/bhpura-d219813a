import { productAvailability, type AvailabilityStatus } from "@/lib/product-availability";
import type { LabelData } from "@/components/barcode-label";
import type { Product, Variant } from "@/features/inventory/types";
import {
  hasPicture,
  productAttentionReasons,
  productMissingCost,
  type AttentionFacts,
  type AttentionKey,
  type AttentionProduct,
} from "@/features/inventory/lib/attention";

/**
 * Pure rules for the inventory product list: stock and sales per product,
 * the scope tabs' filters, search and sort, category options, barcode labels
 * and product duplication.
 */

export type InventoryScope =
  "all" | "attention" | "active" | "low" | "out" | "featured" | "inactive" | "made_to_order";

export const INVENTORY_SORTS = [
  "newest",
  "name",
  "price-asc",
  "price-desc",
  "stock-asc",
  "stock-desc",
  "best-selling",
] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

/** Units sold per variant across the loaded orders. */
export function salesByVariantFrom(salesHistory: any[]): Map<string, number> {
  const map = new Map<string, number>();
  salesHistory.forEach((order) => {
    (order.order_items ?? []).forEach((item: { variant_id?: string | null; quantity?: number }) => {
      if (item.variant_id) {
        const qty = Number(item.quantity || 0);
        map.set(item.variant_id, (map.get(item.variant_id) || 0) + qty);
      }
    });
  });
  return map;
}

/** Store plus incubator stock across the product's variants. */
export function productStockFrom(variants: Variant[], productId: string): number {
  return variants
    .filter((variant) => variant.product_id === productId)
    .reduce(
      (sum, variant) =>
        sum + Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0),
      0,
    );
}

/**
 * Expected weekly sales: each variant's daily rate over its age, capped at the
 * 45-day sales window (variants without a creation date count the full window).
 */
export function productWeeklySalesFrom(
  variants: Variant[],
  salesByVariant: Map<string, number>,
  productId: string,
  now: number = Date.now(),
): number {
  const pVariants = variants.filter((v) => v.product_id === productId);
  const productDailyVelocity = pVariants.reduce((sum, v) => {
    const qtySold = salesByVariant.get(v.id) || 0;
    const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
    const daysElapsed = variantCreatedAt
      ? Math.max(
          1,
          Math.min(45, Math.ceil((now - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24))),
        )
      : 45;
    return sum + qtySold / daysElapsed;
  }, 0);
  return productDailyVelocity * 7;
}

/**
 * Each product's figures, worked out once for the whole list: its pieces (the store's and its
 * partners'), expected weekly sales and the lowest price a shopper can pay. The list used to
 * walk every variant again for every product, for every tab and every sort.
 */
export type ProductFigures = {
  stock: number;
  weeklySales: number;
  lowestPrice: number;
  /** A size or the product has no cost (`productMissingCost`), for staff who may see costs. */
  missingCost: boolean;
};

const NO_FIGURES: ProductFigures = { stock: 0, weeklySales: 0, lowestPrice: 0, missingCost: false };

export function productFiguresFrom(
  products: Array<Pick<Product, "id" | "base_price"> & Parameters<typeof productMissingCost>[0]>,
  variantsByProduct: Record<string, Variant[]>,
  salesByVariant: Map<string, number>,
  now: number = Date.now(),
): Map<string, ProductFigures> {
  const figures = new Map<string, ProductFigures>();
  for (const product of products) {
    const variants = variantsByProduct[product.id] ?? [];
    figures.set(product.id, {
      stock: productStockFrom(variants, product.id),
      weeklySales: productWeeklySalesFrom(variants, salesByVariant, product.id, now),
      lowestPrice:
        variants.length > 0
          ? Math.min(...variants.map((variant) => Number(variant.selling_price || 0)))
          : Number(product.base_price || 0),
      missingCost: productMissingCost(product, variants),
    });
  }
  return figures;
}

export function figuresOf(figures: Map<string, ProductFigures>, productId: string) {
  return figures.get(productId) ?? NO_FIGURES;
}

export function productHasMedia(product: Pick<Product, "image_url" | "media">): boolean {
  return hasPicture(product);
}

type StockedProduct = Pick<Product, "is_made_to_order" | "item_kind">;

/**
 * How the product stands on stock: out, low or available for one sold from stock; a
 * made-to-order piece or a service is never low or out, whatever its ready stock.
 */
export function productStockStatus(
  product: StockedProduct,
  stock: number,
  weeklySales = 0,
  lowStockUnits?: number,
): AvailabilityStatus {
  return productAvailability(product, stock, weeklySales, lowStockUnits).status;
}

/** "Needs attention": the product has at least one issue (`productAttentionReasons`). */
export function productNeedsAttention(product: AttentionProduct, facts: AttentionFacts): boolean {
  return productAttentionReasons(product, facts).length > 0;
}

/** The scope a dashboard link (`?filter=`) opens; null when it names none. */
export function inventoryScopeFromFilter(filter?: string): InventoryScope | null {
  if (filter === "low_stock" || filter === "low") return "low";
  if (filter === "out_of_stock" || filter === "out") return "out";
  if (filter === "attention") return "attention";
  if (filter === "active") return "active";
  if (filter === "inactive" || filter === "hidden") return "inactive";
  if (filter === "featured") return "featured";
  if (filter === "made_to_order") return "made_to_order";
  if (filter === "all") return "all";
  return null;
}

export function variantsByProductFrom(variants: Variant[]): Record<string, Variant[]> {
  const map: Record<string, Variant[]> = {};
  variants.forEach((v) => {
    if (!map[v.product_id]) map[v.product_id] = [];
    map[v.product_id].push(v);
  });
  return map;
}

/**
 * Products matching the search (name, category, variant SKU/barcode/size/colour),
 * category, scope and issue, sorted. "newest" keeps the loaded order. A price sort goes by the
 * lowest price a shopper can pay (the price the row shows), not by the product's base price.
 */
export function filterInventoryProducts({
  products,
  variantsByProduct,
  search,
  category,
  scope,
  sortBy,
  productStock,
  productWeeklySales,
  issue = "all",
  lowStockUnits,
  lowestPrice,
  pricesMatter = true,
  missingCost,
  lang = "en",
}: {
  products: Product[];
  variantsByProduct: Record<string, Variant[]>;
  search: string;
  category: string;
  scope: InventoryScope;
  sortBy: string;
  productStock: (productId: string) => number;
  productWeeklySales: (productId: string) => number;
  /** Only the products carrying this issue. */
  issue?: "all" | AttentionKey;
  lowStockUnits?: number;
  lowestPrice?: (productId: string) => number;
  pricesMatter?: boolean;
  /** Whether a product has no cost; left out for staff who may not see costs. */
  missingCost?: (productId: string) => boolean;
  lang?: "ar" | "en";
}): Product[] {
  const reasonsOf = (product: Product) =>
    productAttentionReasons(product, {
      stock: productStock(product.id),
      weeklySales: productWeeklySales(product.id),
      lowStockUnits,
      lowestPrice: lowestPrice?.(product.id),
      pricesMatter,
      missingCost: missingCost?.(product.id) ?? false,
    });
  const priceOf = (product: Product) =>
    lowestPrice ? lowestPrice(product.id) : Number(product.base_price || 0);
  const nameOf = (product: Product) =>
    (lang === "ar" ? product.name_ar || product.name : product.name_en || product.name) || "";
  const result = products.filter((product) => {
    const productVariants = variantsByProduct[product.id] || [];
    const searchable = [
      product.name,
      product.name_ar,
      product.name_en,
      product.category,
      ...productVariants.flatMap((variant) => [
        variant.sku,
        variant.barcode,
        variant.size,
        variant.color,
      ]),
    ]
      .join(" ")
      .toLowerCase();

    const stock = productStock(product.id);
    const matchesSearch = !search || searchable.includes(search);
    const matchesCategory = category === "all" || product.category === category;

    let matchesScope = true;
    if (scope === "attention") {
      matchesScope = reasonsOf(product).length > 0;
    } else if (scope === "active") {
      matchesScope = Boolean(product.is_active);
    } else if (scope === "low") {
      matchesScope =
        productStockStatus(product, stock, productWeeklySales(product.id), lowStockUnits) === "low";
    } else if (scope === "out") {
      matchesScope = productStockStatus(product, stock) === "out";
    } else if (scope === "featured") {
      matchesScope = Boolean(product.featured_trending);
    } else if (scope === "inactive") {
      matchesScope = !product.is_active;
    } else if (scope === "made_to_order") {
      matchesScope = productStockStatus(product, stock) === "made_to_order";
    }

    const matchesIssue = issue === "all" || reasonsOf(product).some((r) => r.key === issue);

    return matchesSearch && matchesCategory && matchesScope && matchesIssue;
  });

  if (sortBy === "price-asc") {
    result.sort((a, b) => priceOf(a) - priceOf(b));
  } else if (sortBy === "price-desc") {
    result.sort((a, b) => priceOf(b) - priceOf(a));
  } else if (sortBy === "stock-asc") {
    result.sort((a, b) => productStock(a.id) - productStock(b.id));
  } else if (sortBy === "stock-desc") {
    result.sort((a, b) => productStock(b.id) - productStock(a.id));
  } else if (sortBy === "best-selling") {
    result.sort((a, b) => productWeeklySales(b.id) - productWeeklySales(a.id));
  } else if (sortBy === "name") {
    result.sort((a, b) => nameOf(a).localeCompare(nameOf(b), lang));
  }

  return result;
}

export type InventoryCategory = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  slug: string | null;
};

/**
 * Category filter options: the categories products actually use, named from
 * the category table when the stored value matches its slug or a name.
 */
export function inventoryCategoryOptions(products: Product[], categories: InventoryCategory[]) {
  const categoriesSet = new Set<string>();
  products.forEach((p) => {
    if (p.category) categoriesSet.add(p.category);
  });

  const categoryLookup = new Map<string, { name_ar?: string | null; name_en?: string | null }>();
  categories.forEach((c) => {
    if (c.slug) categoryLookup.set(c.slug.toLowerCase(), c);
    if (c.name_en) categoryLookup.set(c.name_en.toLowerCase(), c);
    if (c.name_ar) categoryLookup.set(c.name_ar.toLowerCase(), c);
  });

  return Array.from(categoriesSet).map((c) => {
    const match = categoryLookup.get(c.toLowerCase());
    return {
      id: c,
      name: match?.name_en || c,
      name_ar: match?.name_ar || match?.name_en || c,
    };
  });
}

/** One label per variant that has a barcode, in product order. */
export function barcodeLabelsFor(
  products: Array<Pick<Product, "id" | "name">>,
  variants: Array<Pick<Variant, "product_id" | "barcode" | "size" | "color" | "selling_price">>,
  businessName: string | null,
  currency?: string | null,
): LabelData[] {
  const labels: LabelData[] = [];
  for (const p of products) {
    for (const v of variants.filter((x) => x.product_id === p.id)) {
      if (!v.barcode) continue;
      labels.push({
        code: v.barcode,
        productName: p.name,
        size: v.size,
        color: v.color,
        price: v.selling_price,
        currency,
        businessName,
      });
    }
  }
  return labels;
}

/** A hidden draft copy of the product, names suffixed "(Copy)" / "(نسخة)". */
export function duplicateProductValues(product: Product, brandId: string, isAr: boolean) {
  const copySuffixAr = " (نسخة)";
  const copySuffixEn = " (Copy)";
  return {
    brand_id: brandId,
    name: `${product.name}${isAr ? copySuffixAr : copySuffixEn}`,
    name_ar: product.name_ar ? `${product.name_ar}${copySuffixAr}` : null,
    name_en: product.name_en ? `${product.name_en}${copySuffixEn}` : null,
    description: product.description,
    description_ar: product.description_ar,
    description_en: product.description_en,
    category: product.category,
    base_price: product.base_price,
    is_active: false,
    image_url: product.image_url,
    media: product.media,
    custom_fields: product.custom_fields,
    fabric_type: product.fabric_type,
    occasion: product.occasion,
    cost_price: product.cost_price ?? 0,
    variant_label_size_ar: product.variant_label_size_ar ?? null,
    variant_label_size_en: product.variant_label_size_en ?? null,
    variant_label_color_ar: product.variant_label_color_ar ?? null,
    variant_label_color_en: product.variant_label_color_en ?? null,
    variant_label_fabric_ar: product.variant_label_fabric_ar ?? null,
    variant_label_fabric_en: product.variant_label_fabric_en ?? null,
    variant_label_four_ar: product.variant_label_four_ar ?? null,
    variant_label_four_en: product.variant_label_four_en ?? null,
    variant_label_five_ar: product.variant_label_five_ar ?? null,
    variant_label_five_en: product.variant_label_five_en ?? null,
    show_sale_badge: product.show_sale_badge,
    size_guide_id: product.size_guide_id ?? null,
    size_guide_hidden: product.size_guide_hidden ?? false,
    is_made_to_order: product.is_made_to_order ?? false,
    // A copy starts as an inactive draft, so it is not featured either.
    featured_trending: false,
  };
}

/** Variant copies for a duplicated product: every option, unit, image and price; new SKUs, no barcode, no incubator stock. */
export function duplicateVariantValues(
  variants: Variant[],
  newProductId: string,
  brandId: string,
  random: () => number = Math.random,
) {
  return variants.map((v) => ({
    product_id: newProductId,
    brand_id: brandId,
    sku: v.sku ? `${v.sku}-COPY-${Math.floor(random() * 1000)}` : null,
    barcode: null,
    size: v.size,
    color: v.color,
    fabric: v.fabric,
    option_four: v.option_four ?? null,
    option_five: v.option_five ?? null,
    size_unit: v.size_unit,
    image_url: v.image_url,
    selling_price: v.selling_price,
    original_price: v.original_price,
    cost_price: v.cost_price,
    stock_main: v.stock_main ?? 0,
    stock_incubator: 0,
  }));
}
