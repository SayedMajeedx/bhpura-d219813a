-- The super admin's home (the owner's request of 2026-11-22): real figures, what needs a person
-- today, the stores with their own numbers, and the stores that were deleted.
--
-- 1. `platform_store_stats()`: each store's sales and orders of the last 30 days (orders that
--    count as sold, `order_counts_as_sold`), its last order, its products, its kind of store and
--    currency, and its subscription with the price of the plan version it is on. Super admins only,
--    checked inside; the screen works the platform's figures out from it.
-- 2. A deleted store is remembered: `delete_brand` either marks a store deleted (soft: its slug
--    gains `-deleted-`) or removes it with its data (hard), and nothing kept a record of either.
--    A trigger on `brands` writes one `saas_audit_logs` row (`brand.deleted`, with no `brand_id`,
--    so removing the store does not take its record with it): the store's names, its address, how
--    it was deleted and who did it. `delete_brand` itself is unchanged.
-- Run in a real Postgres by tests/super-admin-home-migration.test.ts.

CREATE OR REPLACE FUNCTION public.platform_store_stats()
RETURNS TABLE (
  brand_id uuid,
  store_vertical text,
  currency text,
  orders_30d integer,
  sales_30d numeric,
  orders_total integer,
  last_order_at timestamptz,
  products integer,
  sub_status text,
  sub_interval text,
  sub_plan_code text,
  sub_period_end timestamptz,
  sub_price_monthly numeric,
  sub_price_annual numeric,
  sub_currency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'NOT_SUPER_ADMIN';
  END IF;

  RETURN QUERY
  WITH sold AS (
    SELECT o.brand_id,
           count(*) FILTER (WHERE o.created_at >= now() - interval '30 days')::integer AS orders_30d,
           COALESCE(sum(o.total) FILTER (WHERE o.created_at >= now() - interval '30 days'), 0)
             AS sales_30d,
           count(*)::integer AS orders_total,
           max(o.created_at) AS last_order_at
      FROM public.orders o
     WHERE public.order_counts_as_sold(o.status)
     GROUP BY o.brand_id
  ),
  catalog AS (
    SELECT p.brand_id, count(*)::integer AS products
      FROM public.products p
     WHERE p.archived_at IS NULL
     GROUP BY p.brand_id
  ),
  sub AS (
    SELECT DISTINCT ON (s.brand_id)
           s.brand_id, s.status, s.billing_interval, pl.code, s.current_period_end,
           v.price_monthly, v.price_annual, v.currency
      FROM public.brand_subscriptions s
      JOIN public.saas_plans pl ON pl.id = s.plan_id
      LEFT JOIN public.saas_plan_versions v ON v.id = s.plan_version_id
     ORDER BY s.brand_id, s.updated_at DESC
  )
  SELECT b.id,
         bs.store_vertical,
         bs.currency,
         COALESCE(sold.orders_30d, 0),
         COALESCE(sold.sales_30d, 0),
         COALESCE(sold.orders_total, 0),
         sold.last_order_at,
         COALESCE(catalog.products, 0),
         sub.status,
         sub.billing_interval,
         sub.code,
         sub.current_period_end,
         sub.price_monthly,
         sub.price_annual,
         sub.currency
    FROM public.brands b
    LEFT JOIN public.business_settings bs ON bs.brand_id = b.id
    LEFT JOIN sold ON sold.brand_id = b.id
    LEFT JOIN catalog ON catalog.brand_id = b.id
    LEFT JOIN sub ON sub.brand_id = b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_store_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_store_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_brand_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_store public.brands%ROWTYPE;
  v_mode text;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_store := OLD;
    v_mode := 'hard';
  ELSE
    -- A soft delete: the slug gains `-deleted-`. Any other change to a store is not a deletion.
    IF OLD.slug LIKE '%-deleted-%' OR NEW.slug NOT LIKE '%-deleted-%' THEN
      RETURN NEW;
    END IF;
    v_store := OLD;
    v_mode := 'soft';
  END IF;

  INSERT INTO public.saas_audit_logs (action, actor_id, actor_email, brand_id, target_type, target_id, changes)
  VALUES (
    'brand.deleted',
    v_actor,
    (SELECT u.email FROM auth.users u WHERE u.id = v_actor),
    NULL,
    'brand',
    v_store.id::text,
    jsonb_build_object(
      'mode', v_mode,
      'slug', v_store.slug,
      'name_en', v_store.name_en,
      'name_ar', v_store.name_ar,
      'created_at', v_store.created_at,
      'plan_type', v_store.plan_type
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_brand_deleted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_brands_record_deleted ON public.brands;
CREATE TRIGGER trg_brands_record_deleted
  AFTER UPDATE OF slug OR DELETE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.record_brand_deleted();
