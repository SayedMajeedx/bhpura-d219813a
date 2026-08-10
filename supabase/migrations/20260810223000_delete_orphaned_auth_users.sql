-- Delete CRM customers and their Auth identity only when that identity no
-- longer has any storefront membership or team/admin profile.
CREATE OR REPLACE FUNCTION public.delete_brand_customers(
  p_brand_id uuid,
  p_customer_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_customer_count integer := 0;
  v_auth_count integer := 0;
  v_auth_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.status = 'active'
       AND (
         p.role = 'super_admin'
         OR (p.brand_id = p_brand_id AND p.role IN ('admin', 'brand_admin'))
       )
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete customers for this brand';
  END IF;

  IF COALESCE(cardinality(p_customer_ids), 0) = 0 THEN
    RETURN jsonb_build_object('customers_deleted', 0, 'auth_users_deleted', 0);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.auth_user_id), ARRAY[]::uuid[])
    INTO v_auth_ids
    FROM public.customers c
   WHERE c.brand_id = p_brand_id
     AND c.id = ANY(p_customer_ids)
     AND c.auth_user_id IS NOT NULL;

  DELETE FROM public.customers c
   WHERE c.brand_id = p_brand_id
     AND c.id = ANY(p_customer_ids);
  GET DIAGNOSTICS v_customer_count = ROW_COUNT;

  -- A profile means the identity still has team/admin access. Another
  -- customer row means it still owns a storefront account in another brand.
  DELETE FROM auth.users u
   WHERE u.id = ANY(v_auth_ids)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
     AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.auth_user_id = u.id);
  GET DIAGNOSTICS v_auth_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'customers_deleted', v_customer_count,
    'auth_users_deleted', v_auth_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_brand_customers(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_brand_customers(uuid, uuid[]) TO authenticated;

-- Keep the existing retryable purge behavior, while also removing Auth users
-- that become completely orphaned after the brand is permanently purged.
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

  FOR v_table IN
    SELECT unnest(ARRAY[
      'customer_addresses', 'order_items', 'product_engagement_daily',
      'customization_options', 'product_variants', 'orders', 'products', 'customers'
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
