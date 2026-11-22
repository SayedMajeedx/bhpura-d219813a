-- Deleting a store with all its data deletes parents before their children (2026-11-22).
--
-- The super admin's "delete everything" stopped with VARIANT_HAS_HISTORY on ZH Abayas: the purge
-- deleted the store's sizes before its products, and since migration 20261111100000 a size with a
-- history (an order, the stock ledger) is deleted only with its product. The same order hit two
-- more rules, found from the live catalog the same day:
-- * an order line an alteration points to is deleted only with its order
--   (ORDER_LINE_HAS_ALTERATION, migration 20261117100000), and the purge deleted lines first;
-- * a partner's stock, movements, sales and transfer lines hold a size (ON DELETE RESTRICT), and
--   the purge deleted them after the sizes; a partner's payment allocations name no store at all
--   (`incubator_payment_allocations` has no brand_id) and hold its payments and sales (RESTRICT),
--   so the purge never reached them.
--
-- The purge now deletes, in this order: the allocations of the store's partner payments and sales;
-- the store's orders (each takes its lines, ON DELETE CASCADE, so the alteration rule lets them
-- go, and the stock engine gives their pieces back before the partners' rows go); the partners'
-- rows, children before the partner; the products (each takes its sizes, so the history rule
-- lets them go); then every other table with a brand_id, as before. The rules themselves are
-- unchanged: a member of staff still cannot delete a size, a line or a product with a history.
-- The soft delete, the super admin check, the retry when the store is already gone and the auth
-- clean-up are the live function's, unchanged.
-- Run in a real Postgres by tests/brand-purge-migration.test.ts.

CREATE OR REPLACE FUNCTION public.delete_brand(p_brand_id uuid, p_hard boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_slug text;
  v_table text;
  v_deleted_rows bigint := 0;
  v_count bigint;
  v_auth_count bigint := 0;
  v_auth_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can delete a brand';
  END IF;

  SELECT slug INTO v_slug FROM public.brands WHERE id = p_brand_id FOR UPDATE;
  IF v_slug IS NULL THEN
    IF p_hard THEN
      RETURN jsonb_build_object('deleted', true, 'mode', 'hard', 'already_absent', true);
    END IF;
    RAISE EXCEPTION 'BRAND_NOT_FOUND';
  END IF;

  IF NOT p_hard THEN
    UPDATE public.brands
       SET is_active = false,
           slug = v_slug || '-deleted-' || extract(epoch from now())::bigint
     WHERE id = p_brand_id;
    RETURN jsonb_build_object('deleted', true, 'mode', 'soft');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT candidate_id), ARRAY[]::uuid[])
    INTO v_auth_ids
    FROM (
      SELECT p.id AS candidate_id
        FROM public.profiles p
       WHERE p.brand_id = p_brand_id AND p.role <> 'super_admin'
      UNION
      SELECT c.auth_user_id
        FROM public.customers c
       WHERE c.brand_id = p_brand_id AND c.auth_user_id IS NOT NULL
    ) candidates;

  -- A partner payment's allocations name no store: reached through the payment and the sale.
  IF to_regclass('public.incubator_payment_allocations') IS NOT NULL THEN
    IF to_regclass('public.incubator_payments') IS NOT NULL THEN
      DELETE FROM public.incubator_payment_allocations a
       USING public.incubator_payments p
       WHERE a.payment_id = p.id AND p.brand_id = p_brand_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted_rows := v_deleted_rows + v_count;
    END IF;
    IF to_regclass('public.incubator_sales') IS NOT NULL THEN
      DELETE FROM public.incubator_payment_allocations a
       USING public.incubator_sales s
       WHERE a.sale_id = s.id AND s.brand_id = p_brand_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted_rows := v_deleted_rows + v_count;
    END IF;
  END IF;

  -- Parents before their children: an order takes its lines and a product its sizes, as the rules
  -- that keep a line's and a size's history allow; a partner's rows hold sizes, so they go first.
  FOR v_table IN
    SELECT unnest(ARRAY[
      'customer_addresses', 'orders', 'order_items', 'product_engagement_daily',
      'customization_options',
      'incubator_payments', 'incubator_sales', 'incubator_movements', 'incubator_inventory',
      'incubator_transfer_items', 'incubator_transfers', 'incubators',
      'products', 'product_variants', 'customers'
    ]::text[])
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE brand_id = $1', v_table) USING p_brand_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted_rows := v_deleted_rows + v_count;
    END IF;
  END LOOP;

  DELETE FROM public.profiles WHERE brand_id = p_brand_id AND role <> 'super_admin';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_rows := v_deleted_rows + v_count;
  UPDATE public.profiles SET brand_id = NULL WHERE brand_id = p_brand_id AND role = 'super_admin';

  FOR v_table IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'brand_id'
       AND c.table_name NOT IN ('brands', 'profiles')
       AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE brand_id = $1', v_table) USING p_brand_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_rows := v_deleted_rows + v_count;
  END LOOP;

  DELETE FROM public.brands WHERE id = p_brand_id;

  DELETE FROM auth.users u
   WHERE u.id = ANY(v_auth_ids)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
     AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.auth_user_id = u.id);
  GET DIAGNOSTICS v_auth_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', true,
    'mode', 'hard',
    'rows_purged', v_deleted_rows,
    'auth_users_deleted', v_auth_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_brand(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_brand(uuid, boolean) TO authenticated;
