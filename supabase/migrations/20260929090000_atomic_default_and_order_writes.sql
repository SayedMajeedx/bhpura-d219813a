-- Bugs #16, #17, #20, #21: four screens wrote in several steps from the
-- browser and ignored the errors in between, so a failure halfway left the
-- data half changed. Each is now one function call, one transaction:
--   1. set_default_customer_address: clear the old default and set the new one
--      (#17). A failure used to leave the customer with no default.
--   2. set_default_message_template: the same for message templates (#21),
--      now backed by a one-default-per-brand unique index like the addresses'.
--   3. reorder_categories: rewrite a brand's category order (#20). The
--      positions were written in parallel and their errors never read.
--   4. apply_bom_to_all_products: give every product the same packaging cost
--      and BOM lines (#16). The cost update and the removal of the old lines
--      ignored their errors, so lines could be doubled (and COGS with them).
-- All four are SECURITY INVOKER: they run as the caller, under the same RLS
-- policies as the direct writes they replace (brand staff, and the shopper for
-- their own addresses).

-- Live data has no brand with two default templates (checked 2026-09-27).
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_one_default_per_brand
  ON public.message_templates (brand_id)
  WHERE is_default;

-- 1. Default customer address ------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_customer_address(
  p_brand_id uuid,
  p_customer_id uuid,
  p_address_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM customer_addresses
    WHERE id = p_address_id AND customer_id = p_customer_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Cleared first: the one-default index is checked row by row.
  UPDATE customer_addresses
     SET is_default = false
   WHERE customer_id = p_customer_id
     AND brand_id = p_brand_id
     AND is_default
     AND id <> p_address_id;

  UPDATE customer_addresses
     SET is_default = true
   WHERE id = p_address_id
     AND NOT is_default;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_default_customer_address(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_customer_address(uuid, uuid, uuid) TO authenticated;

-- 2. Default message template ------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_message_template(
  p_brand_id uuid,
  p_template_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM message_templates WHERE id = p_template_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE message_templates
     SET is_default = false
   WHERE brand_id = p_brand_id
     AND is_default
     AND id <> p_template_id;

  UPDATE message_templates
     SET is_default = true
   WHERE id = p_template_id
     AND NOT is_default;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_default_message_template(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_message_template(uuid, uuid) TO authenticated;

-- 3. Category order ----------------------------------------------------------
-- p_category_ids is the brand's categories in their new order; each gets its
-- position (1, 2, 3...) as sort_order.
CREATE OR REPLACE FUNCTION public.reorder_categories(
  p_brand_id uuid,
  p_category_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM categories
    WHERE brand_id = p_brand_id AND id = ANY (p_category_ids)
  ) <> coalesce(cardinality(p_category_ids), 0) THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE categories c
     SET sort_order = t.position::integer
    FROM unnest(p_category_ids) WITH ORDINALITY AS t(id, position)
   WHERE c.id = t.id
     AND c.brand_id = p_brand_id
     AND c.sort_order IS DISTINCT FROM t.position::integer;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_categories(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_categories(uuid, uuid[]) TO authenticated;

-- 4. Packaging BOM for every product -----------------------------------------
-- p_lines: [{ "packaging_material_id": uuid, "quantity_per_unit": integer }].
-- Returns how many products were changed (nothing is written when none).
CREATE OR REPLACE FUNCTION public.apply_bom_to_all_products(
  p_brand_id uuid,
  p_direct_packaging_cost numeric,
  p_lines jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_products integer;
BEGIN
  UPDATE products
     SET direct_packaging_cost = p_direct_packaging_cost
   WHERE brand_id = p_brand_id;
  GET DIAGNOSTICS v_products = ROW_COUNT;
  IF v_products = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM product_bom_items WHERE brand_id = p_brand_id;

  INSERT INTO product_bom_items (brand_id, product_id, packaging_material_id, quantity_per_unit)
  SELECT p_brand_id,
         p.id,
         (line ->> 'packaging_material_id')::uuid,
         (line ->> 'quantity_per_unit')::integer
    FROM products p
   CROSS JOIN jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) AS line
   WHERE p.brand_id = p_brand_id;

  RETURN v_products;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_bom_to_all_products(uuid, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_bom_to_all_products(uuid, numeric, jsonb) TO authenticated;
