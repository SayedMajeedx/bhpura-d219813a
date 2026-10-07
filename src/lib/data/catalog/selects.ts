/**
 * The columns of `products` and `product_variants` the admin screens read. Costs are not here: they
 * live in their own staff-only tables (`product_costs`, `variant_costs`) and are merged in by
 * `./costs`, so the catalog tables themselves can stop handing costs to every signed-in account.
 *
 * A column added to either table later must be added here (and granted to `authenticated`);
 * tests/catalog-admin-columns.test.ts fails when this list and the generated types drift apart.
 */

/** Cost columns that moved out of the catalog tables. */
export const PRODUCT_COST_COLUMNS = ["cost_price", "direct_packaging_cost", "vendor_id"] as const;
export const VARIANT_COST_COLUMNS = ["cost_price"] as const;

export const ADMIN_PRODUCT_COLUMNS = [
  "auto_deactivated_out_of_stock",
  "base_price",
  "booking_buffer_minutes",
  "booking_capacity",
  "booking_notice_hours",
  "booking_scope",
  "brand_id",
  "category",
  "created_at",
  "custom_fields",
  "description",
  "description_ar",
  "description_en",
  "extra_hour_price",
  "fabric_type",
  "featured_trending",
  "id",
  "image_url",
  "is_active",
  "is_made_to_order",
  "is_package",
  "item_kind",
  "media",
  "name",
  "name_ar",
  "name_en",
  "occasion",
  "service_includes",
  "service_location",
  "show_sale_badge",
  "size_guide_hidden",
  "size_guide_id",
  "tracks_inventory",
  "updated_at",
  "user_id",
  "variant_label_color",
  "variant_label_color_ar",
  "variant_label_color_en",
  "variant_label_fabric",
  "variant_label_fabric_ar",
  "variant_label_fabric_en",
  "variant_label_five_ar",
  "variant_label_five_en",
  "variant_label_four_ar",
  "variant_label_four_en",
  "variant_label_size",
  "variant_label_size_ar",
  "variant_label_size_en",
] as const;

export const ADMIN_VARIANT_COLUMNS = [
  "barcode",
  "brand_id",
  "color",
  "created_at",
  "duration_minutes",
  "fabric",
  "id",
  "image_url",
  "option_five",
  "option_four",
  "original_price",
  "product_id",
  "selling_price",
  "size",
  "size_unit",
  "sku",
  "stock",
  "stock_incubator",
  "stock_main",
  "updated_at",
  "user_id",
] as const;

export const ADMIN_PRODUCT_SELECT = ADMIN_PRODUCT_COLUMNS.join(", ");
export const ADMIN_VARIANT_SELECT = ADMIN_VARIANT_COLUMNS.join(", ");
