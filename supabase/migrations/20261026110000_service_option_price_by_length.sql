-- Migration: 20261026110000_service_option_price_by_length.sql
--
-- An add-on can cost more for a longer booking. A photo-booth's instant prints are 30 for the
-- first 3 hours and 10 more for each hour after, its magnets 25 and 10: until now an add-on was
-- one flat price (or blocks by quantity), so a store had to repeat the add-on once per length.
--
--   * service_options.extra_hour_price   added to the add-on's price for each hour the booking
--                          runs beyond the service's shortest length (null: the same price at any
--                          length). Flat add-ons only: a block-priced one (envelopes) is by
--                          quantity, not length.
--
-- The length is the booking's own (ends_at - starts_at), the base the service's shortest length
-- (its variants' lowest duration_minutes), so an add-on on a 3-hour-and-up service costs its price
-- at 3 hours, price + 1 x extra at 4, and so on. `src/lib/bookings/service-options.ts`
-- (`optionPrice`, `extraHoursOf`) is its twin for what a customer sees as they choose;
-- tests/service-options.test.ts runs both against each other. Additive.

ALTER TABLE public.service_options
  ADD COLUMN IF NOT EXISTS extra_hour_price numeric(12, 3)
    CHECK (extra_hour_price IS NULL OR extra_hour_price >= 0);

ALTER TABLE public.service_options
  DROP CONSTRAINT IF EXISTS service_options_extra_hour_flat_only;
ALTER TABLE public.service_options
  ADD CONSTRAINT service_options_extra_hour_flat_only
  CHECK (extra_hour_price IS NULL OR tiers IS NULL);

COMMENT ON COLUMN public.service_options.extra_hour_price IS
  'Added to the price for each hour the booking runs beyond the service''s shortest length (null: one price at any length).';

-- Whole hours a booking of `p_minutes` runs beyond `p_base_minutes` (a started hour counts).
CREATE OR REPLACE FUNCTION public.service_option_extra_hours(p_minutes integer, p_base_minutes integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_minutes IS NULL OR p_base_minutes IS NULL OR p_minutes <= p_base_minutes THEN 0
    ELSE ceil((p_minutes - p_base_minutes) / 60.0)::integer
  END;
$function$;

-- apply_booking_options as it was, with the add-on priced for the booking's length.
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

-- The new helper is only for the database's own functions.
REVOKE ALL ON FUNCTION public.service_option_extra_hours(integer, integer) FROM PUBLIC, anon, authenticated;
