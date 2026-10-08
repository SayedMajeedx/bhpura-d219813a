-- Costs leave the signed-in role's reach (phase 3 of 3).
--
-- Phase 1 gave costs their own staff-only tables (20261007170000), phase 2 moved the admin screens
-- onto them (#250, deployed). What was left: `authenticated` (staff and every shopper's account
-- alike) could still SELECT the old cost columns of any brand's active products, because the
-- catalog's public-read policy shows those rows and the table grant shows every column.
--
-- A column-level REVOKE is ignored while a table-level SELECT exists, so the table grant is
-- replaced by one on every column except the costs, the way 20261007120000 did for `anon`:
--
--   products          cost_price, direct_packaging_cost, vendor_id   (no longer selectable)
--   product_variants  cost_price                                     (no longer selectable)
--
-- Unchanged: INSERT and UPDATE (the admin still writes the old columns and the phase 1 triggers
-- copy them into the staff-only tables), service_role, and `anon` (already cut off). The functions
-- that read the old columns for costing and reports are SECURITY DEFINER, so they keep working;
-- apply_bom_to_all_products only writes the column.
--
-- The column lists are built from the table as it is now, so no column is left out by mistake. A
-- column added later is not readable by `authenticated` until a migration grants it:
-- `npm run db:catalog-columns:check` (and CI) fails when one is missing.
--
-- Safe to run twice.

DO $$
DECLARE
  product_columns text;
  variant_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO product_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name NOT IN ('cost_price', 'direct_packaging_cost', 'vendor_id');

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO variant_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'product_variants'
    AND column_name NOT IN ('cost_price');

  EXECUTE 'REVOKE SELECT ON public.products FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.products TO authenticated', product_columns);

  EXECUTE 'REVOKE SELECT ON public.product_variants FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.product_variants TO authenticated', variant_columns);
END
$$;
