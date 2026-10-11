-- Pieces held at partners have one source, and opening stock reaches the stock ledger.
--
-- A piece "at incubators" is counted twice: a total on the variant
-- (product_variants.stock_incubator) and a quantity per partner (incubator_inventory.quantity).
-- The partner functions (transfer, return, sale, reversal) change both. Three other paths
-- changed the total alone, so the two could drift apart with nothing to say so:
--
--   * an order: when the store's own stock runs out, the order engine takes the piece from the
--     partners' total, and nobody was told which partner has to hand it back;
--   * the manual stock adjustment (the stepper in the inventory list);
--   * a new variant created with a quantity "at incubators" that no partner holds.
--
-- And one path that never reached the ledger at all: the opening stock typed when a variant is
-- created was inserted straight into the row. The nightly reconciliation treats the ledger as
-- the authority and would have reset that stock to zero on its next run. No store had yet
-- created a variant with stock since the ledger began (checked on 2026-10-11: 65 variants
-- created since, none with stock, no run ever corrected anything), so nothing was lost.
--
-- What this holds from now on:
--
--   1. A new variant's stock starts in the store and is written to the ledger as its opening
--      movement. Pieces go to a partner by a transfer, never by typing a number.
--   2. The total at partners changes only with a partner (transfer, return, sale, reversal) or
--      with an order. The ledger refuses anything else, and is no longer callable from a
--      browser at all: it is reached through functions that check their own caller.
--   3. An order that takes pieces from partners says which partner: the partner's quantity
--      goes down with the reservation and comes back if the order is released, and
--      order_incubator_allocations records who is to hand over what.
--   4. The manual adjustment is for a signed-in member of staff who manages inventory (its
--      check was skipped for a caller with no session) and for the store's own stock only.

-- 1. A new variant's stock ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.product_variants_opening_stock_home()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- No partner holds a piece of a variant that does not exist yet: whatever was typed as
  -- "at incubators" is in the store until it is transferred.
  IF COALESCE(NEW.stock_incubator, 0) <> 0 THEN
    NEW.stock_main := COALESCE(NEW.stock_main, 0) + GREATEST(NEW.stock_incubator, 0);
    NEW.stock_incubator := 0;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.product_variants_opening_stock_home() FROM PUBLIC, anon, authenticated;

-- Named to run before trg_product_variants_sync_stock, which adds the two into `stock`.
DROP TRIGGER IF EXISTS trg_product_variants_opening_stock ON public.product_variants;
CREATE TRIGGER trg_product_variants_opening_stock
  BEFORE INSERT ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.product_variants_opening_stock_home();

CREATE OR REPLACE FUNCTION public.product_variants_opening_stock_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid := NEW.brand_id;
BEGIN
  IF COALESCE(NEW.stock_main, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF v_brand IS NULL THEN
    SELECT brand_id INTO v_brand FROM public.products WHERE id = NEW.product_id;
  END IF;
  IF v_brand IS NULL THEN
    RETURN NEW;
  END IF;

  -- The row already carries the stock; this is its first line in the ledger, so the ledger's
  -- sum equals the stock and the nightly reconciliation leaves it alone.
  INSERT INTO public.inventory_movements (
    brand_id, variant_id, location, delta, balance_after,
    reason, reference_type, reference_id, idempotency_key, actor_id, note
  ) VALUES (
    v_brand, NEW.id, 'main', NEW.stock_main, NEW.stock_main,
    'manual_adjust', 'opening_stock', NULL, 'opening:' || NEW.id::text, auth.uid(), 'Opening stock'
  )
  ON CONFLICT (brand_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.product_variants_opening_stock_ledger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_variants_opening_ledger ON public.product_variants;
CREATE TRIGGER trg_product_variants_opening_ledger
  AFTER INSERT ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.product_variants_opening_stock_ledger();

-- 2. Which partner an order takes a piece from ----------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_incubator_allocations (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  incubator_id uuid NOT NULL REFERENCES public.incubators(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, variant_id, incubator_id)
);

CREATE INDEX IF NOT EXISTS idx_order_incubator_allocations_incubator
  ON public.order_incubator_allocations (brand_id, incubator_id);

ALTER TABLE public.order_incubator_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_incubator_allocations_select" ON public.order_incubator_allocations;
CREATE POLICY "order_incubator_allocations_select"
  ON public.order_incubator_allocations
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

-- Written by the order engine only.
REVOKE ALL ON public.order_incubator_allocations FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.order_incubator_allocations FROM authenticated;
GRANT SELECT ON public.order_incubator_allocations TO authenticated;
GRANT ALL ON public.order_incubator_allocations TO service_role;

-- A partner's movement history gains the two things an order does to it.
ALTER TABLE public.incubator_movements
  DROP CONSTRAINT IF EXISTS incubator_movements_movement_type_check;
ALTER TABLE public.incubator_movements
  ADD CONSTRAINT incubator_movements_movement_type_check CHECK (
    movement_type = ANY (ARRAY[
      'transfer_in'::text, 'return'::text, 'sale'::text, 'sale_reversal'::text,
      'adjustment'::text, 'order_reserve'::text, 'order_release'::text
    ])
  );

-- Called by the ledger when an order's movement touches the partners' total. A reservation
-- (a negative delta) is taken from the partner holding the most of the piece first, so as few
-- partners as possible have to hand something over; a release goes back to the partners this
-- order took from.
CREATE OR REPLACE FUNCTION public.order_incubator_sync(
  p_order_id uuid,
  p_variant_id uuid,
  p_brand_id uuid,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_left integer;
  v_take integer;
  r record;
BEGIN
  IF p_delta < 0 THEN
    v_left := -p_delta;
    FOR r IN
      SELECT id, incubator_id, quantity
      FROM public.incubator_inventory
      WHERE variant_id = p_variant_id AND brand_id = p_brand_id AND quantity > 0
      ORDER BY quantity DESC, created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, r.quantity);

      UPDATE public.incubator_inventory SET quantity = quantity - v_take WHERE id = r.id;

      INSERT INTO public.order_incubator_allocations (
        order_id, variant_id, incubator_id, quantity, brand_id
      )
      VALUES (p_order_id, p_variant_id, r.incubator_id, v_take, p_brand_id)
      ON CONFLICT (order_id, variant_id, incubator_id) DO UPDATE
        SET quantity = order_incubator_allocations.quantity + EXCLUDED.quantity,
            updated_at = now();

      INSERT INTO public.incubator_movements (
        brand_id, incubator_id, variant_id, movement_type, quantity_delta,
        reference_type, reference_id, notes
      )
      VALUES (
        p_brand_id, r.incubator_id, p_variant_id, 'order_reserve', -v_take,
        'order', p_order_id, 'Reserved by an order'
      );

      v_left := v_left - v_take;
    END LOOP;
  ELSIF p_delta > 0 THEN
    v_left := p_delta;
    FOR r IN
      SELECT incubator_id, quantity
      FROM public.order_incubator_allocations
      WHERE order_id = p_order_id AND variant_id = p_variant_id
      ORDER BY quantity DESC, incubator_id
      FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, r.quantity);

      UPDATE public.incubator_inventory
      SET quantity = quantity + v_take
      WHERE incubator_id = r.incubator_id AND variant_id = p_variant_id;

      IF r.quantity = v_take THEN
        DELETE FROM public.order_incubator_allocations
        WHERE order_id = p_order_id AND variant_id = p_variant_id
          AND incubator_id = r.incubator_id;
      ELSE
        UPDATE public.order_incubator_allocations
        SET quantity = quantity - v_take, updated_at = now()
        WHERE order_id = p_order_id AND variant_id = p_variant_id
          AND incubator_id = r.incubator_id;
      END IF;

      INSERT INTO public.incubator_movements (
        brand_id, incubator_id, variant_id, movement_type, quantity_delta,
        reference_type, reference_id, notes
      )
      VALUES (
        p_brand_id, r.incubator_id, p_variant_id, 'order_release', v_take,
        'order', p_order_id, 'Released by an order'
      );

      v_left := v_left - v_take;
    END LOOP;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.order_incubator_sync(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_incubator_sync(uuid, uuid, uuid, integer) TO service_role;

-- 3. The ledger ------------------------------------------------------------------------------
-- The previous definition with three changes: the caller check is written for a function no
-- browser calls, a movement of the partners' total must come from a partner or an order, and
-- an order's movement there is passed on to order_incubator_sync.

CREATE OR REPLACE FUNCTION public.apply_inventory_movement(p_brand_id uuid, p_variant_id uuid, p_location text, p_delta integer, p_reason text, p_reference_type text, p_reference_id uuid, p_idempotency_key text, p_actor_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS inventory_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.inventory_movements%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_cur_bal integer;
  v_new_bal integer;
  v_movement public.inventory_movements%ROWTYPE;
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_caller uuid := auth.uid();
BEGIN
  -- No browser calls this (its EXECUTE is revoked below): it is reached through the order
  -- engine, the partner functions and the manual adjustment, each of which checks its own
  -- caller. A caller with no session is therefore the server (a checkout, a trigger, the
  -- nightly job); a member of staff behind the call must still belong to the store.
  IF v_caller IS NOT NULL THEN
    IF NOT public.can_access_brand(p_brand_id) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
  END IF;

  -- Validate inputs
  IF p_location NOT IN ('main', 'incubator') THEN
    RAISE EXCEPTION 'INVALID_LOCATION: location must be main or incubator';
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'INVALID_DELTA: delta must be non-zero';
  END IF;

  IF p_reason NOT IN (
    'order_reserve', 'order_release', 'order_commit',
    'manual_adjust', 'return_restock', 'transfer',
    'import', 'correction', 'reconciliation'
  ) THEN
    RAISE EXCEPTION 'INVALID_REASON: %', p_reason;
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  -- Pieces at a partner move only with that partner (a transfer, a return, a sale or its
  -- reversal) or with an order that takes them: nothing else may change the total, or it
  -- would stop matching what each partner holds.
  IF p_location = 'incubator'
     AND p_reason <> 'reconciliation'
     AND COALESCE(p_reference_type, '') NOT IN (
       'order', 'incubator_transfer', 'incubator_return',
       'incubator_sale', 'incubator_sale_reversal'
     ) THEN
    RAISE EXCEPTION 'PARTNER_STOCK_MOVES_WITH_ITS_PARTNER';
  END IF;

  -- Fast path idempotency check before locking
  SELECT * INTO v_existing
  FROM public.inventory_movements
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Acquire transaction-level advisory lock on the variant
  PERFORM pg_advisory_xact_lock(hashtext(p_variant_id::text));

  -- Lock variant row and verify brand ownership
  SELECT * INTO v_variant
  FROM public.product_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND:%', p_variant_id;
  END IF;

  IF v_variant.brand_id <> p_brand_id THEN
    RAISE EXCEPTION 'VARIANT_BRAND_MISMATCH:%', p_variant_id;
  END IF;

  -- Re-check idempotency under lock to handle concurrent race
  SELECT * INTO v_existing
  FROM public.inventory_movements
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Calculate current balance and prospective new balance
  IF p_location = 'main' THEN
    v_cur_bal := COALESCE(v_variant.stock_main, 0);
  ELSE
    v_cur_bal := COALESCE(v_variant.stock_incubator, 0);
  END IF;

  v_new_bal := v_cur_bal + p_delta;

  IF v_new_bal < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', p_variant_id;
  END IF;

  -- Authorize update to bypass direct-write guard trigger
  PERFORM set_config('inventory.apply_via_ledger', '1', true);

  -- Perform single atomic stock update
  IF p_location = 'main' THEN
    UPDATE public.product_variants
    SET stock_main = v_new_bal,
        updated_at = now()
    WHERE id = p_variant_id;
  ELSE
    UPDATE public.product_variants
    SET stock_incubator = v_new_bal,
        updated_at = now()
    WHERE id = p_variant_id;
  END IF;

  -- Insert immutable ledger record
  INSERT INTO public.inventory_movements (
    brand_id, variant_id, location, delta, balance_after,
    reason, reference_type, reference_id, idempotency_key,
    actor_id, note
  ) VALUES (
    p_brand_id, p_variant_id, p_location, p_delta, v_new_bal,
    p_reason, p_reference_type, p_reference_id, p_idempotency_key,
    v_actor, p_note
  )
  RETURNING * INTO v_movement;

  -- An order that takes (or gives back) pieces held at partners: say which partner.
  IF p_location = 'incubator' AND p_reference_type = 'order' AND p_reference_id IS NOT NULL THEN
    PERFORM public.order_incubator_sync(p_reference_id, p_variant_id, p_brand_id, p_delta);
  END IF;

  RETURN v_movement;
END;
$function$;

-- No browser calls the ledger: every caller is a function that checks its own caller, or the
-- server. (A signed-in account of the store could call it directly and write any stock.)
REVOKE ALL ON FUNCTION public.apply_inventory_movement(
  uuid, uuid, text, integer, text, text, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_inventory_movement(
  uuid, uuid, text, integer, text, text, uuid, text, uuid, text
) TO service_role;

-- 4. The manual adjustment --------------------------------------------------------------------
-- The previous definition with two changes: the caller must be a signed-in member of the
-- store's staff who manages inventory, and the partners' total is not adjusted by hand.

CREATE OR REPLACE FUNCTION public.rpc_adjust_variant_stock(p_variant_id uuid, p_location text, p_mode text, p_value integer, p_reason text DEFAULT 'manual_adjust'::text, p_note text DEFAULT NULL::text)
 RETURNS inventory_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variant public.product_variants%ROWTYPE;
  v_brand_id uuid;
  v_cur_stock integer;
  v_delta integer;
  v_movement public.inventory_movements%ROWTYPE;
BEGIN
  IF p_location NOT IN ('main', 'incubator') THEN
    RAISE EXCEPTION 'INVALID_LOCATION: must be main or incubator';
  END IF;

  IF p_mode NOT IN ('set', 'delta') THEN
    RAISE EXCEPTION 'INVALID_MODE: must be set or delta';
  END IF;

  IF p_reason NOT IN ('manual_adjust', 'correction', 'import', 'transfer') THEN
    RAISE EXCEPTION 'INVALID_REASON: %', p_reason;
  END IF;

  -- Acquire advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_variant_id::text));

  SELECT * INTO v_variant
  FROM public.product_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND:%', p_variant_id;
  END IF;

  v_brand_id := v_variant.brand_id;

  -- A signed-in member of the store's staff who manages inventory, nobody else. (The check
  -- used to be skipped for a caller with no session.)
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_brand_id)
     OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Pieces at a partner are counted per partner: they change with a transfer, a return or a
  -- sale on the partner's page, never by typing a number here.
  IF p_location = 'incubator' THEN
    RAISE EXCEPTION 'PARTNER_STOCK_MOVES_WITH_ITS_PARTNER';
  END IF;

  IF p_location = 'main' THEN
    v_cur_stock := COALESCE(v_variant.stock_main, 0);
  ELSE
    v_cur_stock := COALESCE(v_variant.stock_incubator, 0);
  END IF;

  IF p_mode = 'set' THEN
    IF p_value < 0 THEN
      RAISE EXCEPTION 'STOCK_CANNOT_BE_NEGATIVE';
    END IF;
    v_delta := p_value - v_cur_stock;
  ELSIF p_mode = 'delta' THEN
    v_delta := p_value;
  END IF;

  IF v_delta = 0 THEN
    SELECT * INTO v_movement
    FROM public.inventory_movements
    WHERE variant_id = p_variant_id AND location = p_location
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN v_movement;
  END IF;

  v_movement := public.apply_inventory_movement(
    p_brand_id => v_brand_id,
    p_variant_id => p_variant_id,
    p_location => p_location,
    p_delta => v_delta,
    p_reason => p_reason,
    p_reference_type => 'manual_adjust',
    p_reference_id => NULL,
    p_idempotency_key => 'adjust:' || gen_random_uuid()::text,
    p_actor_id => auth.uid(),
    p_note => p_note
  );

  RETURN v_movement;
END;
$function$;
