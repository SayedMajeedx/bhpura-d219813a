-- ==============================================================================
-- Single Write Path: apply_inventory_movement & rpc_adjust_variant_stock
-- Enforces immutable ledger logging, transaction locking, and bypass guard.
-- ==============================================================================

-- 1. Function: public.apply_inventory_movement
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  p_brand_id uuid,
  p_variant_id uuid,
  p_location text,
  p_delta integer,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid,
  p_idempotency_key text,
  p_actor_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.inventory_movements%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_cur_bal integer;
  v_new_bal integer;
  v_movement public.inventory_movements%ROWTYPE;
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  -- Multi-tenant authorization check: required for authenticated callers
  IF auth.uid() IS NOT NULL AND NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
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

  RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_inventory_movement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_inventory_movement TO authenticated, service_role;

-- 2. Function: public.rpc_adjust_variant_stock
CREATE OR REPLACE FUNCTION public.rpc_adjust_variant_stock(
  p_variant_id uuid,
  p_location text,
  p_mode text,
  p_value integer,
  p_reason text DEFAULT 'manual_adjust',
  p_note text DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF auth.uid() IS NOT NULL AND NOT public.can_access_brand(v_brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
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
$$;

REVOKE ALL ON FUNCTION public.rpc_adjust_variant_stock FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_variant_stock TO authenticated, service_role;

-- 3. Trigger guard against direct writes on product_variants
CREATE OR REPLACE FUNCTION public.trg_guard_product_variants_stock_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.stock_main IS DISTINCT FROM NEW.stock_main OR OLD.stock_incubator IS DISTINCT FROM NEW.stock_incubator) THEN
    IF current_setting('inventory.apply_via_ledger', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'DIRECT_STOCK_UPDATE_FORBIDDEN: stock_main and stock_incubator can only be modified via apply_inventory_movement()';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_product_variants_stock_update ON public.product_variants;
CREATE TRIGGER trg_guard_product_variants_stock_update
BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.trg_guard_product_variants_stock_update();

-- 4. Revoke direct column updates from authenticated
REVOKE UPDATE (stock, stock_main, stock_incubator) ON public.product_variants FROM authenticated, anon, PUBLIC;

NOTIFY pgrst, 'reload schema';
