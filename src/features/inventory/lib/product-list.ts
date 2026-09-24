import { isLowStock, isOutOfStock } from "@/lib/inventory-health";
import type { LabelData } from "@/components/barcode-label";
import type { Product, Variant } from "@/features/inventory/types";

/**
 * Pure rules for the inventory product list: stock and sales per product,
 * the scope tabs' filters, search and sort, category options, barcode labels
 * and product duplication.
 */

export type InventoryScope =
  "all" | "attention" | "active" | "low" | "out" | "featured" | "inactive";

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

export function productHasMedia(product: Pick<Product, "image_url" | "media">): boolean {
  const media: unknown[] = Array.isArray(product.media) ? product.media : [];
  return Boolean(
    product.image_url ||
    media.some((m) => {
      if (typeof m === "string") return Boolean(m.trim());
      const item = m as { url?: string; src?: string } | null;
      return Boolean(item?.url || item?.src);
    }),
  );
}

/** "Needs attention": low or out of stock, or no photo. */
export function productNeedsAttention(
  product: Pick<Product, "image_url" | "media">,
  stock: number,
  weeklySales: number,
): boolean {
  const isCriticalStock = isLowStock(stock, weeklySales) || isOutOfStock(stock);
  return isCriticalStock || !productHasMedia(product);
}

/** The scope a dashboard link (`?filter=`) opens; null when it names none. */
export function inventoryScopeFromFilter(filter?: string): InventoryScope | null {
  if (filter === "low_stock" || filter === "low") return "low";
  if (filter === "out_of_stock" || filter === "out") return "out";
  if (filter === "attention") return "attention";
  if (filter === "active") return "active";
  if (filter === "inactive" || filter === "hidden") return "inactive";
  if (filter === "featured") return "featured";
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
 * category and scope, sorted. "newest" keeps the loaded order.
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
}: {
  products: Product[];
  variantsByProduct: Record<string, Variant[]>;
  search: string;
  category: string;
  scope: InventoryScope;
  sortBy: string;
  productStock: (productId: string) => number;
  productWeeklySales: (productId: string) => number;
}): Product[] {
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
      matchesScope = productNeedsAttention(product, stock, productWeeklySales(product.id));
    } else if (scope === "active") {
      matchesScope = Boolean(product.is_active);
    } else if (scope === "low") {
      matchesScope = isLowStock(stock, productWeeklySales(product.id));
    } else if (scope === "out") {
      matchesScope = isOutOfStock(stock);
    } else if (scope === "featured") {
      matchesScope = Boolean(product.featured_trending);
    } else if (scope === "inactive") {
      matchesScope = !product.is_active;
    }

    return matchesSearch && matchesCategory && matchesScope;
  });

  if (sortBy === "price-asc") {
    result.sort((a, b) => (a.base_price || 0) - (b.base_price || 0));
  } else if (sortBy === "price-desc") {
    result.sort((a, b) => (b.base_price || 0) - (a.base_price || 0));
  } else if (sortBy === "stock-asc") {
    result.sort((a, b) => productStock(a.id) - productStock(b.id));
  }

  return result;
}

export type InventoryCategory = {
  id: string;
  name_en: string;
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
  };
}

/** Variant copies for a duplicated product: new SKUs, no barcode, no incubator stock. */
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
    selling_price: v.selling_price,
    cost_price: v.cost_price,
    stock_main: v.stock_main ?? 0,
    stock_incubator: 0,
  }));
}
