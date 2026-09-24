/**
 * Row shapes returned by the storefront catalog queries in this folder.
 * Each type matches a select constant in `selects.ts`; change them together.
 */

/** Identifies the store for a query: `id` scopes the rows, `slug` keys the cache. */
export type StorefrontBrandRef = { id: string; slug: string };

/** Product as shown in grids: home, category, search, wishlist, recently viewed. */
export type ProductRow = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  category: string | null;
  image_url: string | null;
  media: unknown;
  brand_id: string;
  created_at: string;
  featured_trending?: boolean;
  show_sale_badge?: boolean;
  is_made_to_order?: boolean;
  custom_fields?: unknown;
  product_variants: Array<{
    id: string;
    selling_price: number;
    original_price: number | null;
    stock_main: number;
    stock_incubator?: number;
    size: string | null;
    size_unit?: string | null;
    color: string | null;
    image_url?: string | null;
  }>;
};

/** Made-to-order products are always orderable; others need stock in some location. */
export function hasAvailableStock(product: ProductRow): boolean {
  if (product.is_made_to_order) {
    return true;
  }
  return product.product_variants.some(
    (variant) => Number(variant.stock_main || 0) + Number(variant.stock_incubator || 0) > 0,
  );
}

export type StorefrontCategory = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  parent_id: string | null;
  image_url: string | null;
  menu_icon_url: string | null;
  sort_order: number | null;
};

export type StorefrontVariant = {
  id: string;
  size: string | null;
  size_unit: string | null;
  color: string | null;
  fabric: string | null;
  option_four?: string | null;
  option_five?: string | null;
  selling_price: number;
  original_price: number | null;
  stock_main: number;
  stock_incubator?: number;
  image_url?: string | null;
};

export type StorefrontCustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "file";
  options?: string[];
  required?: boolean;
};

/** Full product for the product page and quick view. */
export type StorefrontProductDetail = {
  id: string;
  category: string | null;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  media: unknown;
  custom_fields: StorefrontCustomField[] | null;
  product_variants: StorefrontVariant[];
  base_price?: number | null;
  is_made_to_order?: boolean | null;
  size_guide_id?: string | null;
  size_guide_hidden?: boolean | null;
  variant_label_size_ar?: string | null;
  variant_label_size_en?: string | null;
  variant_label_color_ar?: string | null;
  variant_label_color_en?: string | null;
  variant_label_fabric_ar?: string | null;
  variant_label_fabric_en?: string | null;
  variant_label_four_ar?: string | null;
  variant_label_four_en?: string | null;
  variant_label_five_ar?: string | null;
  variant_label_five_en?: string | null;
};

/** Lightweight product for "you may also like" and related-product rails. */
export type RecommendationProduct = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  category: string | null;
  image_url: string | null;
  media: unknown;
  custom_fields?: unknown;
  is_made_to_order?: boolean | null;
  product_variants: Array<{
    id: string;
    selling_price: number;
    original_price: number | null;
    stock_main: number;
    stock_incubator?: number;
  }>;
};

/** Result row for the instant search boxes (header search and search overlay). */
export type QuickSearchResult = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  category: string | null;
  image_url: string | null;
  media: Array<{ type: "image" | "video"; url: string }> | null;
  product_variants: Array<{
    id: string;
    selling_price: number;
    original_price: number | null;
    stock: number | null;
  }>;
};

export type BestSellerRow = { product_id: string; units_sold: number };

export type TrendingRow = {
  product_id: string;
  engagement_score: number;
  manually_featured: boolean;
};
