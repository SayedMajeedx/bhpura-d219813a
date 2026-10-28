-- A service's lengths are saved as one set (the owner's report of 2026-10-28, Aurora's Diamond
-- Package). The editor created, updated and deleted a service's variants one call at a time from
-- the list it read when it opened, and never read them again: saving twice made the same length
-- twice, and a length made after it opened could not be removed, so a package offered only for
-- 5 hours still showed 4 hours, twice. Now the editor sends the lengths it shows and the database
-- makes the service's variants exactly those (set_service_lengths): one variant per length, the
-- same result however many times it is sent, and a length can never be stored twice
-- (product_variants_one_per_length). Run in a real Postgres by tests/service-lengths-migration.test.ts.

-- 1. A length stored twice keeps its first variant: whatever pointed at the others points at it.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id,
           first_value(id) OVER (
             PARTITION BY product_id, duration_minutes ORDER BY created_at, id
           ) AS keep
      FROM public.product_variants
     WHERE duration_minutes IS NOT NULL
  LOOP
    CONTINUE WHEN r.id = r.keep;
    UPDATE public.booking_items SET variant_id = r.keep WHERE variant_id = r.id;
    UPDATE public.order_items SET variant_id = r.keep WHERE variant_id = r.id;
    DELETE FROM public.product_variants WHERE id = r.id;
  END LOOP;
END $$;

-- 2. One variant per length of a service.
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_one_per_length
  ON public.product_variants (product_id, duration_minutes)
  WHERE duration_minutes IS NOT NULL;

-- 3. The lengths a service is offered at, as one set: each {minutes (null: one fixed price),
-- price, compare_at (null: none), size (its name)}. The service's variants become exactly these,
-- matched by length; the others are removed (a booking or an order that used one keeps its line).
-- It runs with the caller's own rights, so the variants' policies decide who may, as before.
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
  v_product public.products%ROWTYPE;
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
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
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
        auth.uid(), v_product.brand_id, p_product_id, v_size, v_price, v_was, v_minutes,
        COALESCE(p_cost, 0)
      )
      ON CONFLICT (product_id, duration_minutes) WHERE duration_minutes IS NOT NULL
      DO UPDATE SET size = EXCLUDED.size, selling_price = EXCLUDED.selling_price,
                    original_price = EXCLUDED.original_price
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.product_variants
         SET size = v_size, selling_price = v_price, original_price = v_was,
             cost_price = COALESCE(p_cost, cost_price)
       WHERE id = v_id;
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
