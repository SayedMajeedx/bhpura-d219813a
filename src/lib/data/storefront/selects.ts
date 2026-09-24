/**
 * Column lists for the public storefront. One list per use, shared by every
 * screen that shows that use, so a cache entry always holds the same shape.
 *
 * Why this matters: before this layer, the categories cache key was filled
 * with three different column lists (menu icons and tile images went missing
 * depending on which screen loaded first), and product grids never fetched
 * `is_made_to_order` or `show_sale_badge`, which the product card relies on.
 *
 * Each list must match its row type in `types.ts`.
 */

/** Product grids (home, category, search, wishlist, recently viewed). Type: `ProductRow`. */
export const PRODUCT_CARD_SELECT =
  "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, featured_trending, show_sale_badge, is_made_to_order, custom_fields, product_variants(id, selling_price, original_price, stock_main, stock_incubator, size, size_unit, color, image_url)";

/**
 * Product page and quick view, without the per-product option labels.
 * `products` has no `original_price` column (prices live on variants); asking
 * for it fails the whole request, which is how the labelled query used to
 * fail on every call.
 */
export const PRODUCT_DETAIL_BASE_SELECT =
  "id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, is_made_to_order, base_price, size_guide_id, size_guide_hidden, product_variants(id, size, size_unit, color, fabric, option_four, option_five, selling_price, original_price, stock_main, stock_incubator, image_url)";

/** Product page and quick view, with option labels. Type: `StorefrontProductDetail`. */
export const PRODUCT_DETAIL_SELECT =
  "id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, is_made_to_order, base_price, size_guide_id, size_guide_hidden, variant_label_size_ar, variant_label_size_en, variant_label_color_ar, variant_label_color_en, variant_label_fabric_ar, variant_label_fabric_en, variant_label_four_ar, variant_label_four_en, variant_label_five_ar, variant_label_five_en, product_variants(id, size, size_unit, color, fabric, option_four, option_five, selling_price, original_price, stock_main, stock_incubator, image_url)";

/** "You may also like" rails. Type: `RecommendationProduct`. */
export const RECOMMENDATION_SELECT =
  "id, name, name_ar, name_en, category, image_url, media, custom_fields, is_made_to_order, product_variants(id, selling_price, original_price, stock_main, stock_incubator)";

/** Instant search boxes. Type: `QuickSearchResult`. */
export const QUICK_SEARCH_SELECT =
  "id, name, name_ar, name_en, category, image_url, media, product_variants(id, selling_price, original_price, stock)";

/** Every category surface: menus, home tiles, category pages, search. Type: `StorefrontCategory`. */
export const CATEGORY_SELECT =
  "id, slug, name_en, name_ar, parent_id, image_url, menu_icon_url, sort_order";
