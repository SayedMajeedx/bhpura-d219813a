-- Read-only probes for features represented by migrations whose ledger history
-- may not match production. This checks actual database objects, not filenames.
SELECT jsonb_build_object(
  'annual_subscriptions', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'subscription_expires_at'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_settings' AND column_name = 'subscription_iban'
  ),
  'renewal_intent', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'renewal_intent'
  ),
  'product_cost_model', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'direct_packaging_cost'
  ),
  'accounting_suite', to_regclass('public.journal_entries') IS NOT NULL,
  'packaging_bom', to_regclass('public.product_bom_items') IS NOT NULL,
  'incubators', to_regclass('public.incubators') IS NOT NULL,
  'incubator_reporting', to_regprocedure('public.rpc_reporting_incubator_sales(timestamp with time zone,timestamp with time zone,text,text,text)') IS NOT NULL,
  'review_rewards', to_regclass('public.order_review_requests') IS NOT NULL,
  'reporting_overview', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_reporting_overview'
  ),
  'returning_customer_promos', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promo_codes' AND column_name = 'returning_customers_only'
  ),
  'mobile_push', to_regclass('public.push_devices') IS NOT NULL,
  'customer_push', to_regclass('public.customer_push_devices') IS NOT NULL,
  'white_label_factory', to_regclass('public.white_label_apps') IS NOT NULL,
  'white_label_releases', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'white_label_app_builds' AND column_name = 'apk_sha256'
  ),
  'product_barcodes_rls', COALESCE((
    SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'product_barcodes'
  ), false),
  'localized_push', to_regprocedure('public.format_localized_order_status(text,text,text)') IS NOT NULL
    AND to_regprocedure('public.format_currency_amount(numeric,text)') IS NOT NULL
) AS feature_probes;
