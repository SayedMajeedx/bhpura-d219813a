-- ==============================================================================
-- Security Audit Hardening, Search Path Fixes, SECURITY DEFINER Permissions Cleanup,
-- Duplicate Index Removal, and RLS InitPlan Performance Optimization
-- ==============================================================================

-- 1. Enable RLS on product_barcodes & create brand access policy
ALTER TABLE IF EXISTS public.product_barcodes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'product_barcodes' 
      AND policyname = 'brand access'
  ) THEN
    CREATE POLICY "brand access" ON public.product_barcodes
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_barcodes.product_id
          AND public.can_access_brand(p.brand_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_barcodes.product_id
          AND public.can_access_brand(p.brand_id)
      )
    );
  END IF;
END $$;

-- 2. Set explicit search_path on functions identified by security advisor
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_customer_email(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_customer_phone(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_tenant_request_approved() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_orders_payment_fulfillment_sync() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_storefront_page_data(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_ensure_contract_signing_token() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_products_fill_user_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_all_admin_quizzes() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_product_active_on_variant_stock() SET search_path = public, pg_temp;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'courier_update_delivery' AND pronargs = 5) THEN
    BEGIN
      ALTER FUNCTION public.courier_update_delivery(uuid, uuid, boolean, numeric, text) SET search_path = public, pg_temp;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      ALTER FUNCTION public.courier_update_delivery(uuid, text, text, boolean, numeric) SET search_path = public, pg_temp;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_admin_quiz' AND pronargs = 6) THEN
    BEGIN
      ALTER FUNCTION public.upsert_admin_quiz(text, text, text, text, text, boolean) SET search_path = public, pg_temp;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_admin_quiz' AND pronargs = 7) THEN
    BEGIN
      ALTER FUNCTION public.upsert_admin_quiz(text, text, text, text, text, boolean, jsonb) SET search_path = public, pg_temp;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_admin_quiz_by_id_or_title') THEN
    BEGIN
      ALTER FUNCTION public.upsert_admin_quiz_by_id_or_title(uuid, text, text, text, text, text, boolean) SET search_path = public, pg_temp;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- 3. Revoke unneeded execution privileges on internal triggers and worker functions
REVOKE EXECUTE ON FUNCTION public.capture_order_delivery_address_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_storefront_order_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_tenant_request_approved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inherit_product_variant_pricing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_restore_stock_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preserve_order_customer_identity_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_card_stock_on_terminal_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_order_stock_on_cancel() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_completed_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_order_item_original_price() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_order_item_unit_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_active_on_variant_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_ensure_contract_signing_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_auto_log_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_deduct_packaging_materials() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_orders_payment_fulfillment_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_products_fill_user_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Revoke internal queue/worker routines from anon & authenticated (grant only to service_role/postgres)
REVOKE EXECUTE ON FUNCTION public.automate_order_email_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automate_order_whatsapp_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_order_email_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_outbox_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_order_email_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_customer_order_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_mobile_automation_failure_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_mobile_low_stock_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_mobile_order_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_mobile_packaging_low_stock_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_mobile_review_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_verified_tap_order(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_order_email_event(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_order_review_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_order_whatsapp_event(uuid, text) FROM PUBLIC, anon, authenticated;

-- Revoke admin-only & internal RPCs from anon
REVOKE EXECUTE ON FUNCTION public.create_tenant_with_defaults(text, text, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_brand(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_brand_customers(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_category(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_integration_credential(uuid, uuid, text, text, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_integration_credential(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_integration_credentials(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_integration_credential_secret(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_business_settings_for_brand() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.archive_room(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_room(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_user_hosting_eligibility() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_daily_hosted_quiz() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.courier_can_read_address(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.courier_can_read_customer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.courier_can_read_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.courier_complete_delivery(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_branch_user_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_brand_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_customer_address_brand_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_order_item_brand_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_benefit_payment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_order_courier(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_whatsapp_delivery_status(text, text, timestamp with time zone, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_incubator_payment(uuid, numeric, date, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_incubator_sale(uuid, uuid, integer, numeric, timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_incubator_sale(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.return_stock_from_incubator(uuid, uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_incubator_inventory_prices(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_stock_to_incubator(uuid, uuid, integer, text, numeric, text, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_incubator_inventory_item(uuid, text, numeric, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_customers(timestamp with time zone, timestamp with time zone, text, boolean, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_expenses(timestamp with time zone, timestamp with time zone, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_export(text, timestamp with time zone, timestamp with time zone, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_incubator_sales(timestamp with time zone, timestamp with time zone, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_overview(timestamp with time zone, timestamp with time zone, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_processing_fees(timestamp with time zone, timestamp with time zone, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_products_inventory(timestamp with time zone, timestamp with time zone, text, boolean, integer, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_sales(timestamp with time zone, timestamp with time zone, text, text, boolean, text) FROM PUBLIC, anon;

-- 4. Drop redundant duplicate indexes
DROP INDEX IF EXISTS public.idx_customers_brand;
DROP INDEX IF EXISTS public.idx_orders_brand;
DROP INDEX IF EXISTS public.idx_products_brand;
DROP INDEX IF EXISTS public.idx_profiles_brand;
DROP INDEX IF EXISTS public.idx_business_settings_brand;

-- 5. Optimize RLS InitPlan evaluation: (select auth.uid())
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customers read own push devices" ON public.customer_push_devices;
CREATE POLICY "customers read own push devices" ON public.customer_push_devices
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users read own push devices" ON public.push_devices;
CREATE POLICY "users read own push devices" ON public.push_devices
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customer self read" ON public.customers;
CREATE POLICY "customer self read" ON public.customers
FOR SELECT TO authenticated
USING (auth_user_id IS NOT NULL AND auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customer self update" ON public.customers;
CREATE POLICY "customer self update" ON public.customers
FOR UPDATE TO authenticated
USING (auth_user_id IS NOT NULL AND auth_user_id = (SELECT auth.uid()))
WITH CHECK (auth_user_id IS NOT NULL AND auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customer_address self read" ON public.customer_addresses;
CREATE POLICY "customer_address self read" ON public.customer_addresses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.auth_user_id IS NOT NULL
      AND c.auth_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "customer address self insert" ON public.customer_addresses;
CREATE POLICY "customer address self insert" ON public.customer_addresses
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.auth_user_id IS NOT NULL
      AND c.auth_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "customer address self update" ON public.customer_addresses;
CREATE POLICY "customer address self update" ON public.customer_addresses
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.auth_user_id IS NOT NULL
      AND c.auth_user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.auth_user_id IS NOT NULL
      AND c.auth_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "customer address self delete" ON public.customer_addresses;
CREATE POLICY "customer address self delete" ON public.customer_addresses
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.auth_user_id IS NOT NULL
      AND c.auth_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "user_subscriptions_user_select" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions_user_select" ON public.user_subscriptions
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "daily_hosted_quiz_user_select" ON public.daily_hosted_quiz_usage;
CREATE POLICY "daily_hosted_quiz_user_select" ON public.daily_hosted_quiz_usage
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);
