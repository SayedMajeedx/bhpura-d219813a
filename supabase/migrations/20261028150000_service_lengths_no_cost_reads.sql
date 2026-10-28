-- Saving a service's lengths no longer reads a cost column.
--
-- set_service_lengths (migration 20261028130000) runs as the signed-in member (SECURITY INVOKER),
-- and read `SELECT * FROM products` and `COALESCE(p_cost, cost_price)` of a variant. Costs are
-- staff-only (`products.cost_price`, `direct_packaging_cost`, `vendor_id` and
-- `product_variants.cost_price` cannot be selected by `authenticated`), so every save of a service
-- in the editor failed with "permission denied for table products". The function now reads only the
-- product's brand and writes a variant's cost only when one was sent. Same name, arguments and
-- grants; tests/service-lengths-costs-migration.test.ts runs it as a role that cannot read costs.

CREATE OR REPLACE FUNCTION public.set_service_lengths(
  p_product_id uuid,
  p_lengths jsonb,
  p_cost numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_row jsonb;
  v_minutes integer;
  v_price numeric;
  v_was numeric;
  v_size text;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_timed boolean := false;
  v_fixed boolean := false;
BEGIN
  SELECT brand_id INTO v_brand_id FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF jsonb_typeof(p_lengths) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lengths) = 0 OR jsonb_array_length(p_lengths) > 48 THEN
    RAISE EXCEPTION 'INVALID_LENGTHS';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_lengths) LOOP
    v_minutes := NULLIF(v_row ->> 'minutes', '')::integer;
    v_price := NULLIF(v_row ->> 'price', '')::numeric;
    v_was := NULLIF(v_row ->> 'compare_at', '')::numeric;
    IF v_minutes IS NULL THEN v_fixed := true; ELSE v_timed := true; END IF;
    IF v_fixed AND v_timed THEN RAISE EXCEPTION 'INVALID_LENGTHS'; END IF;
    IF v_minutes IS NOT NULL AND (v_minutes < 1 OR v_minutes > 4320) THEN
      RAISE EXCEPTION 'INVALID_LENGTHS';
    END IF;
    IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
    IF v_was IS NOT NULL AND v_was <= v_price THEN RAISE EXCEPTION 'INVALID_COMPARE_AT'; END IF;
    v_size := left(COALESCE(NULLIF(btrim(v_row ->> 'size'), ''), 'Service'), 80);

    SELECT id INTO v_id
      FROM public.product_variants
     WHERE product_id = p_product_id
       AND duration_minutes IS NOT DISTINCT FROM v_minutes
       AND id <> ALL (v_keep)
     ORDER BY created_at, id
     LIMIT 1
       FOR UPDATE;
    IF v_id IS NULL THEN
      INSERT INTO public.product_variants (
        user_id, brand_id, product_id, size, selling_price, original_price, duration_minutes,
        cost_price
      ) VALUES (
        auth.uid(), v_brand_id, p_product_id, v_size, v_price, v_was, v_minutes,
        COALESCE(p_cost, 0)
      )
      ON CONFLICT (product_id, duration_minutes) WHERE duration_minutes IS NOT NULL
      DO UPDATE SET size = EXCLUDED.size, selling_price = EXCLUDED.selling_price,
                    original_price = EXCLUDED.original_price
      RETURNING id INTO v_id;
    ELSE
      -- Only a cost that was sent is written: `COALESCE(p_cost, cost_price)` would read the column.
      IF p_cost IS NULL THEN
        UPDATE public.product_variants
           SET size = v_size, selling_price = v_price, original_price = v_was
         WHERE id = v_id;
      ELSE
        UPDATE public.product_variants
           SET size = v_size, selling_price = v_price, original_price = v_was, cost_price = p_cost
         WHERE id = v_id;
      END IF;
    END IF;
    IF v_id = ANY (v_keep) THEN RAISE EXCEPTION 'DUPLICATE_LENGTH'; END IF;
    v_keep := v_keep || v_id;
  END LOOP;

  DELETE FROM public.product_variants
   WHERE product_id = p_product_id AND id <> ALL (v_keep);

  RETURN (
    SELECT jsonb_agg(jsonb_build_object('id', v.id, 'minutes', v.duration_minutes)
                     ORDER BY v.duration_minutes NULLS FIRST)
      FROM public.product_variants v
     WHERE v.product_id = p_product_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.set_service_lengths(uuid, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_service_lengths(uuid, jsonb, numeric) TO authenticated;
