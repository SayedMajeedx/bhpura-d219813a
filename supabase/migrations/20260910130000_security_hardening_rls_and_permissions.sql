-- 1. Fix mutable search paths
ALTER FUNCTION public.get_storefront_page_data(text) SET search_path = public;
ALTER FUNCTION public.sync_product_active_on_variant_stock() SET search_path = public;
ALTER FUNCTION public.update_return_updated_at() SET search_path = public;

-- 2. Explicit RLS policies for tables with RLS enabled but no policies defined

-- WhatsApp Suite (Managed securely via Edge Functions & service_role)
CREATE POLICY "whatsapp_integrations_deny_public" ON public.whatsapp_integrations
  FOR ALL TO public USING (false);

CREATE POLICY "whatsapp_templates_deny_public" ON public.whatsapp_templates
  FOR ALL TO public USING (false);

CREATE POLICY "whatsapp_outbox_deny_public" ON public.whatsapp_outbox
  FOR ALL TO public USING (false);

CREATE POLICY "whatsapp_webhook_events_deny_public" ON public.whatsapp_webhook_events
  FOR ALL TO public USING (false);

-- Sensitive backend receipts & quota tables
CREATE POLICY "pending_benefit_receipts_deny_public" ON public.pending_benefit_receipts
  FOR ALL TO public USING (false);

CREATE POLICY "api_quota_usage_deny_public" ON public.api_quota_usage
  FOR ALL TO public USING (false);

-- Push & Email background queues/logs
CREATE POLICY "customer_push_delivery_log_deny_public" ON public.customer_push_delivery_log
  FOR ALL TO public USING (false);

CREATE POLICY "order_email_events_deny_public" ON public.order_email_events
  FOR ALL TO public USING (false);

CREATE POLICY "push_delivery_log_deny_public" ON public.push_delivery_log
  FOR ALL TO public USING (false);

CREATE POLICY "push_notification_events_deny_public" ON public.push_notification_events
  FOR ALL TO public USING (false);

-- Tenant analytical & notification data
CREATE POLICY "brand_email_notifications_select" ON public.brand_email_notifications
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

CREATE POLICY "brand_email_notifications_deny_insert" ON public.brand_email_notifications
  FOR INSERT TO public WITH CHECK (false);

CREATE POLICY "product_engagement_daily_select" ON public.product_engagement_daily
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

CREATE POLICY "product_engagement_daily_deny_mutation" ON public.product_engagement_daily
  FOR INSERT TO public WITH CHECK (false);

-- 3. Revoke anon EXECUTE on sensitive SECURITY DEFINER functions that are not for public storefront
REVOKE EXECUTE ON FUNCTION public.archive_customer_fit_passport() FROM anon;
REVOKE EXECUTE ON FUNCTION public.version_customer_fit_passport() FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_api_quota(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_sync_legacy_brands_to_subscriptions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_benefit_payment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_benefit_payment(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_create_exchange_replacement_order(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_inspect_and_restock_return_item(uuid, uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_process_return_refund(uuid, uuid, text, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_process_return_loyalty_adjustment(uuid, uuid, uuid, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_manual_adjust_loyalty_points(uuid, uuid, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_generate_abandoned_cart_recovery_coupon(uuid, uuid, text, numeric, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_customers(timestamp with time zone, timestamp with time zone, text, boolean, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_products_inventory(timestamp with time zone, timestamp with time zone, text, boolean, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reporting_sales(timestamp with time zone, timestamp with time zone, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_brand_email_notifications(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_brand_invoice_number() FROM anon;
