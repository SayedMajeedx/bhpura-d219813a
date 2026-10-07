-- A visitor can no longer read a store's costs through the public API.
--
-- `anon` could SELECT every column of `products` and `product_variants` (the catalog policy lets it
-- see active products), so anyone holding the public API key, which is in every page of the site,
-- could read each brand's cost price, packaging cost and supplier id, who entered it, and the
-- barcodes. The storefront never asks for those columns (its column lists are in
-- src/lib/data/storefront/selects.ts), so `anon` keeps exactly the columns it reads and loses:
--
--   products          cost_price, direct_packaging_cost, vendor_id, user_id
--   product_variants  cost_price, barcode, user_id
--
-- Postgres ignores a column-level REVOKE while a table-level SELECT exists, so the table-level
-- grant is removed and the allowed columns are granted one by one. A column added later is not
-- readable by `anon` until it is granted here; tests/anon-catalog-columns.test.ts fails if the
-- storefront selects a column that is not granted.
--
-- Not changed: signed-in accounts (`authenticated`: staff and shoppers alike) keep every column,
-- because staff need them and use the same database role as shoppers. A signed-in user can still
-- read another brand's costs through the catalog policy; closing that needs the cost columns moved
-- into a staff-only table, which is a larger change of its own.
--
-- Grants only: no table, column, policy or function changes. Safe to run twice.

REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
    id, name, description, category, image_url, created_at,
    updated_at, brand_id, is_active, media, base_price, name_ar,
    name_en, description_ar, description_en, custom_fields, featured_trending, show_sale_badge,
    variant_label_size, variant_label_color, variant_label_fabric, variant_label_size_ar, variant_label_size_en, variant_label_color_ar,
    variant_label_color_en, variant_label_fabric_ar, variant_label_fabric_en, tracks_inventory, variant_label_four_ar, variant_label_four_en,
    variant_label_five_ar, variant_label_five_en, fabric_type, occasion, auto_deactivated_out_of_stock, size_guide_id,
    size_guide_hidden, is_made_to_order, item_kind, service_location, service_includes, booking_capacity,
    booking_scope, booking_buffer_minutes, booking_notice_hours, is_package, extra_hour_price
) ON public.products TO anon;

REVOKE SELECT ON public.product_variants FROM anon;
GRANT SELECT (
    id, product_id, sku, size, color, fabric,
    selling_price, stock, created_at, updated_at, stock_main, stock_incubator,
    brand_id, size_unit, original_price, image_url, option_four, option_five,
    duration_minutes
) ON public.product_variants TO anon;
