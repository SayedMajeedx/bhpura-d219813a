-- Product codes (the owner's request of 2026-11-18: Pura's pieces had no codes, and its new
-- partner shop uses the store's codes). A size's code is `product_variants.sku`.
--
-- 1. Each store numbers its codes: an optional prefix and the next number
--    (`brand_code_numbering`). With no row yet, the next number follows the highest plain number
--    the store already uses, as a code of its own or as a code written at a partner shop; Pura's
--    run is 40xx, so its next is 4049.
-- 2. A code is unique within a store (archived sizes aside), however it is spelt.
-- 3. A new size saved with no code takes the store's next number.
-- 4. `assign_variant_codes` writes many codes at once, all or none, refusing one already used, and
--    can give each piece at a partner shop with no code there the store's code.
--
-- Run in a real Postgres by tests/product-codes-migration.test.ts.

CREATE TABLE IF NOT EXISTS public.brand_code_numbering (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT '' CHECK (prefix ~ '^[A-Z0-9-]{0,6}$'),
  next_number integer NOT NULL CHECK (next_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_code_numbering ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_code_numbering_staff_read ON public.brand_code_numbering;
CREATE POLICY brand_code_numbering_staff_read ON public.brand_code_numbering
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
REVOKE ALL ON public.brand_code_numbering FROM anon, authenticated;
GRANT SELECT ON public.brand_code_numbering TO authenticated;

-- The code as it is compared: no spaces at either end, case ignored.
CREATE OR REPLACE FUNCTION public.variant_code_key(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(lower(trim(COALESCE(p_code, ''))), '');
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_brand_code_uniq
  ON public.product_variants (brand_id, public.variant_code_key(sku))
  WHERE public.variant_code_key(sku) IS NOT NULL AND archived_at IS NULL;

-- The highest plain number a store uses, as its own code or as a partner's code.
CREATE OR REPLACE FUNCTION public.brand_highest_code_number(p_brand_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(max(n), 0)::integer FROM (
    SELECT trim(sku)::bigint AS n FROM public.product_variants
    WHERE brand_id = p_brand_id AND trim(COALESCE(sku, '')) ~ '^[0-9]{1,9}$'
    UNION ALL
    SELECT trim(external_code)::bigint FROM public.incubator_inventory
    WHERE brand_id = p_brand_id AND trim(COALESCE(external_code, '')) ~ '^[0-9]{1,9}$'
  ) numbers;
$function$;

-- Takes the store's next code (its prefix and number), skipping any code already used.
CREATE OR REPLACE FUNCTION public.take_variant_code(p_brand_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.brand_code_numbering;
  v_code text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('variant_codes:' || p_brand_id::text));
  INSERT INTO public.brand_code_numbering (brand_id, next_number)
  VALUES (p_brand_id, GREATEST(public.brand_highest_code_number(p_brand_id) + 1, 1))
  ON CONFLICT (brand_id) DO NOTHING;
  SELECT * INTO v_row FROM public.brand_code_numbering WHERE brand_id = p_brand_id FOR UPDATE;
  LOOP
    v_code := v_row.prefix || v_row.next_number::text;
    v_row.next_number := v_row.next_number + 1;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.product_variants
      WHERE brand_id = p_brand_id AND archived_at IS NULL
        AND public.variant_code_key(sku) = public.variant_code_key(v_code)
    );
  END LOOP;
  UPDATE public.brand_code_numbering
  SET next_number = v_row.next_number, updated_at = now()
  WHERE brand_id = p_brand_id;
  RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.take_variant_code(uuid) FROM PUBLIC, anon, authenticated;

-- A new size saved with no code takes the store's next number. Named to run after the trigger
-- that fills in the size's store.
CREATE OR REPLACE FUNCTION public.product_variants_give_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.brand_id IS NOT NULL AND public.variant_code_key(NEW.sku) IS NULL THEN
    NEW.sku := public.take_variant_code(NEW.brand_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.product_variants_give_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_variants_z_give_code ON public.product_variants;
CREATE TRIGGER trg_product_variants_z_give_code
  BEFORE INSERT ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.product_variants_give_code();

-- Writes many codes at once. Each item: { variant_id, sku, barcode? }. All or none; a code
-- already used by another size of the store, or twice in the batch, is refused
-- (`CODE_TAKEN:<variant>`); a barcode is only written to a size that has none. With
-- p_fill_partner_codes, each piece at a partner shop with no code there takes the size's code.
-- The store's next number moves past the highest number written.
CREATE OR REPLACE FUNCTION public.assign_variant_codes(
  p_items jsonb, p_fill_partner_codes boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_variant uuid;
  v_code text;
  v_barcode text;
  v_brand uuid;
  v_first_brand uuid;
  v_written integer := 0;
  v_barcodes integer := 0;
  v_partner integer := 0;
  v_constraint text;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_NUMBER';
  END IF;
  IF jsonb_array_length(p_items) > 2000 THEN
    RAISE EXCEPTION 'TOO_MANY_CODES';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_code := upper(trim(COALESCE(v_item ->> 'sku', '')));
    v_barcode := NULLIF(trim(COALESCE(v_item ->> 'barcode', '')), '');
    SELECT brand_id INTO v_brand FROM public.product_variants WHERE id = v_variant FOR UPDATE;
    IF v_brand IS NULL OR NOT public.can_access_brand(v_brand)
       OR NOT public.has_permission('manage_inventory') THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    v_first_brand := COALESCE(v_first_brand, v_brand);
    IF v_brand <> v_first_brand THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF v_code !~ '^[A-Z0-9][A-Z0-9-]{0,39}$' THEN
      RAISE EXCEPTION 'INVALID_CODE:%', v_variant;
    END IF;
    IF v_barcode IS NOT NULL AND v_barcode !~ '^[0-9]{8,14}$' THEN
      RAISE EXCEPTION 'INVALID_BARCODE:%', v_variant;
    END IF;

    BEGIN
      UPDATE public.product_variants
      SET sku = v_code,
          barcode = CASE WHEN NULLIF(trim(COALESCE(barcode, '')), '') IS NULL
                         THEN COALESCE(v_barcode, barcode) ELSE barcode END
      WHERE id = v_variant;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint ILIKE '%barcode%' THEN
        RAISE EXCEPTION 'BARCODE_TAKEN:%', v_variant;
      END IF;
      RAISE EXCEPTION 'CODE_TAKEN:%', v_variant;
    END;
    v_written := v_written + 1;
    IF v_barcode IS NOT NULL THEN v_barcodes := v_barcodes + 1; END IF;
  END LOOP;

  IF p_fill_partner_codes THEN
    UPDATE public.incubator_inventory ii
    SET external_code = v.sku
    FROM public.product_variants v
    WHERE v.id = ii.variant_id AND ii.brand_id = v_first_brand
      AND NULLIF(trim(COALESCE(ii.external_code, '')), '') IS NULL
      AND public.variant_code_key(v.sku) IS NOT NULL;
    GET DIAGNOSTICS v_partner = ROW_COUNT;
  END IF;

  -- The next number never falls on one just written.
  PERFORM pg_advisory_xact_lock(hashtext('variant_codes:' || v_first_brand::text));
  INSERT INTO public.brand_code_numbering (brand_id, next_number)
  VALUES (v_first_brand, public.brand_highest_code_number(v_first_brand) + 1)
  ON CONFLICT (brand_id) DO UPDATE SET
    next_number = GREATEST(brand_code_numbering.next_number,
      public.brand_highest_code_number(v_first_brand) + 1),
    updated_at = now();

  RETURN jsonb_build_object('codes', v_written, 'barcodes', v_barcodes,
    'partner_codes', v_partner);
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_variant_codes(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_variant_codes(jsonb, boolean) TO authenticated;

-- What the tool shows as the next number before anything is written (staff of the store).
CREATE OR REPLACE FUNCTION public.next_variant_code_number(p_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.brand_code_numbering;
BEGIN
  IF NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  SELECT * INTO v_row FROM public.brand_code_numbering WHERE brand_id = p_brand_id;
  RETURN jsonb_build_object(
    'prefix', COALESCE(v_row.prefix, ''),
    'next_number', COALESCE(v_row.next_number,
      GREATEST(public.brand_highest_code_number(p_brand_id) + 1, 1))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.next_variant_code_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_variant_code_number(uuid) TO authenticated;
