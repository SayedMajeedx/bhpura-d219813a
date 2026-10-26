-- Migration: 20261026120000_service_option_requires_option.sql
--
-- An add-on that only makes sense with another one. A photo booth's magnets are made from its
-- instant prints and its envelopes hold them: neither can be booked without the prints. Until now
-- every add-on stood alone, so a customer could book magnets with no prints.
--
--   * service_options.requires_option_id   the add-on of the same service that must be on for this
--                          one to be. One level only: the add-on it needs needs nothing itself.
--
-- apply_booking_options keeps a dependent add-on only while the one it needs is on: one the
-- customer did not choose (or that is on by default) simply goes with it; one the customer chose
-- while the other is off is refused (BOOKING_OPTION_REQUIRES_OTHER). The same rule is in
-- `src/lib/bookings/service-options.ts` (`optionAvailable`, `cleanSelection`) for what a customer
-- sees as they choose; tests/service-options.test.ts runs both. Additive.

ALTER TABLE public.service_options
  ADD COLUMN IF NOT EXISTS requires_option_id uuid
    REFERENCES public.service_options(id) ON DELETE SET NULL;

ALTER TABLE public.service_options
  DROP CONSTRAINT IF EXISTS service_options_not_self_required;
ALTER TABLE public.service_options
  ADD CONSTRAINT service_options_not_self_required
  CHECK (requires_option_id IS NULL OR requires_option_id <> id);

COMMENT ON COLUMN public.service_options.requires_option_id IS
  'Another add-on of the same service that must be on for this one to be (null: stands alone).';

-- The add-on it needs belongs to the same service and needs nothing itself.
CREATE OR REPLACE FUNCTION public.service_options_requires_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.requires_option_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_options o
       WHERE o.id = NEW.requires_option_id
         AND o.product_id = NEW.product_id
         AND o.brand_id = NEW.brand_id
         AND o.requires_option_id IS NULL
    ) THEN
      RAISE EXCEPTION 'OPTION_REQUIRES_INVALID' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.service_options o WHERE o.requires_option_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'OPTION_REQUIRES_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS service_options_requires_guard ON public.service_options;
CREATE TRIGGER service_options_requires_guard
  BEFORE INSERT OR UPDATE OF requires_option_id, product_id ON public.service_options
  FOR EACH ROW EXECUTE FUNCTION public.service_options_requires_guard();

-- apply_booking_options as it was (priced by the booking's length), with dependent add-ons.
CREATE OR REPLACE FUNCTION public.apply_booking_options(
  p_booking_id uuid, p_parent_item_id uuid, p_product_id uuid,
  p_selected jsonb, p_explicit boolean
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_opt record;
  v_chosen jsonb;
  v_on boolean;
  v_step integer;
  v_qty integer;
  v_price numeric(12, 3);
  v_total numeric(12, 3) := 0;
  v_minutes integer;
  v_base integer;
  v_on_ids uuid[] := ARRAY[]::uuid[];
  v_sel jsonb := CASE WHEN jsonb_typeof(p_selected) = 'array' THEN p_selected ELSE '[]'::jsonb END;
BEGIN
  IF p_product_id IS NULL THEN RETURN 0; END IF;
  SELECT brand_id, (extract(epoch FROM (ends_at - starts_at)) / 60)::integer
    INTO v_brand, v_minutes
    FROM public.bookings WHERE id = p_booking_id;
  SELECT min(duration_minutes) INTO v_base
    FROM public.product_variants WHERE product_id = p_product_id AND duration_minutes IS NOT NULL;

  -- A choice of an option the service does not have is refused.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sel) AS e
     WHERE NOT EXISTS (
       SELECT 1 FROM public.service_options o
        WHERE o.id::text = e ->> 'option_id' AND o.product_id = p_product_id
          AND o.brand_id = v_brand AND o.is_active
     )
  ) THEN
    RAISE EXCEPTION 'BOOKING_OPTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- First, which add-ons stand on their own (included, required, on by default, chosen) ...
  FOR v_opt IN
    SELECT * FROM public.service_options
     WHERE product_id = p_product_id AND brand_id = v_brand AND is_active
       AND requires_option_id IS NULL
  LOOP
    SELECT e INTO v_chosen FROM jsonb_array_elements(v_sel) AS e
     WHERE e ->> 'option_id' = v_opt.id::text LIMIT 1;
    v_on := CASE v_opt.mode
      WHEN 'included' THEN true
      WHEN 'required' THEN true
      WHEN 'default_on' THEN (NOT p_explicit) OR v_chosen IS NOT NULL
      ELSE v_chosen IS NOT NULL
    END;
    IF v_on THEN
      v_on_ids := v_on_ids || v_opt.id;
    END IF;
  END LOOP;

  -- ... then each add-on, a dependent one only with the one it needs.
  FOR v_opt IN
    SELECT * FROM public.service_options
     WHERE product_id = p_product_id AND brand_id = v_brand AND is_active
     ORDER BY sort_order, created_at, id
  LOOP
    SELECT e INTO v_chosen FROM jsonb_array_elements(v_sel) AS e
     WHERE e ->> 'option_id' = v_opt.id::text LIMIT 1;
    v_on := CASE v_opt.mode
      WHEN 'included' THEN true
      WHEN 'required' THEN true
      WHEN 'default_on' THEN (NOT p_explicit) OR v_chosen IS NOT NULL
      ELSE v_chosen IS NOT NULL
    END;
    IF v_opt.requires_option_id IS NOT NULL AND NOT (v_opt.requires_option_id = ANY (v_on_ids)) THEN
      -- The customer asked for it without what it needs: refused. Otherwise it goes with it.
      IF v_chosen IS NOT NULL AND v_opt.mode IN ('optional', 'default_on') THEN
        RAISE EXCEPTION 'BOOKING_OPTION_REQUIRES_OTHER' USING ERRCODE = '22023';
      END IF;
      v_on := false;
    END IF;
    CONTINUE WHEN NOT v_on;

    v_qty := 1;
    IF v_opt.tiers IS NOT NULL THEN
      v_step := (v_opt.tiers ->> 'step')::integer;
      v_qty := COALESCE((v_chosen ->> 'quantity')::integer, v_step);
      IF v_qty < v_step OR v_qty % v_step <> 0
         OR (v_opt.max_quantity IS NOT NULL AND v_qty > v_opt.max_quantity) THEN
        RAISE EXCEPTION 'BOOKING_OPTION_QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_price := public.service_option_price(v_opt.mode, v_opt.price, v_opt.tiers, v_qty);
    -- A longer booking costs more for an add-on priced by the hour.
    IF v_opt.mode <> 'included' AND v_opt.tiers IS NULL AND v_opt.extra_hour_price IS NOT NULL THEN
      v_price := v_price + v_opt.extra_hour_price * public.service_option_extra_hours(v_minutes, v_base);
    END IF;
    v_total := v_total + v_price;

    INSERT INTO public.booking_items (
      booking_id, brand_id, product_id, variant_id, name_en, name_ar, quantity, unit_price,
      parent_item_id, option_id, option_quantity
    ) VALUES (
      p_booking_id, v_brand, NULL, NULL,
      CASE WHEN v_opt.tiers IS NOT NULL
           THEN COALESCE(v_opt.name_en, v_opt.name_ar) || ' × ' || v_qty
           ELSE COALESCE(v_opt.name_en, v_opt.name_ar) END,
      CASE WHEN v_opt.tiers IS NOT NULL
           THEN COALESCE(v_opt.name_ar, v_opt.name_en) || ' × ' || v_qty
           ELSE COALESCE(v_opt.name_ar, v_opt.name_en) END,
      1, v_price, p_parent_item_id, v_opt.id, CASE WHEN v_opt.tiers IS NOT NULL THEN v_qty END
    );
  END LOOP;
  RETURN v_total;
END;
$function$;
