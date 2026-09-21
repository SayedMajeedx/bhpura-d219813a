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
    AND to_regprocedure('public.format_currency_amount(numeric,text)') IS NOT NULL,
  'duplicate_triggers_exist', EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_table IN ('orders', 'order_items', 'product_variants')
      AND trigger_schema = 'public'
    GROUP BY event_object_table, action_statement, event_manipulation, action_timing
    HAVING count(*) > 1
  )
) AS feature_probes;

-- Detailed Trigger Audit Probe:
-- Lists (function, count(*)) for triggers on orders, order_items, product_variants
-- and flags any function bound more than once for the same event and timing.
SELECT
  event_object_table,
  action_timing,
  event_manipulation,
  action_statement,
  count(*) AS binding_count,
  array_agg(trigger_name ORDER BY trigger_name) AS trigger_names,
  CASE WHEN count(*) > 1 THEN 'DUPLICATE_TRIGGER_DEFECT' ELSE 'OK' END AS status
FROM information_schema.triggers
WHERE event_object_table IN ('orders', 'order_items', 'product_variants')
  AND trigger_schema = 'public'
GROUP BY event_object_table, action_timing, event_manipulation, action_statement
ORDER BY (count(*) > 1) DESC, event_object_table, action_statement;

-- -----------------------------------------------------------------------------
-- Inventory Remediation Probe 1: Stock Trigger Exclusivity
-- Asserts exactly one trigger per stock function and no duplicate bindings.
-- -----------------------------------------------------------------------------
SELECT
  event_object_table,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement,
  CASE
    WHEN count(*) OVER (PARTITION BY event_object_table, action_statement, event_manipulation, action_timing) = 1 THEN 'EXACTLY_ONE_TRIGGER_OK'
    ELSE 'DUPLICATE_TRIGGER_DEFECT'
  END AS exclusivity_status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('orders', 'order_items', 'product_variants')
  AND (
    action_statement ILIKE '%inventory%'
    OR action_statement ILIKE '%stock%'
  )
ORDER BY event_object_table, trigger_name;

-- -----------------------------------------------------------------------------
-- Inventory Remediation Probe 2: Non-negative Stock CHECK Constraint Validity
-- Asserts product_variants_stock_nonnegative is present and VALIDATED.
-- -----------------------------------------------------------------------------
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  convalidated,
  CASE
    WHEN convalidated THEN 'VALID'
    ELSE 'NOT_VALIDATED'
  END AS validation_status
FROM pg_constraint
WHERE conname = 'product_variants_stock_nonnegative'
  AND conrelid = 'public.product_variants'::regclass;

-- -----------------------------------------------------------------------------
-- Inventory Remediation Probe 3: Ledger Invariant Verification
-- Asserts cached stock_main and stock_incubator match the sum of ledger deltas
-- for all variants across all brands.
-- -----------------------------------------------------------------------------
WITH ledger_aggregates AS (
  SELECT
    variant_id,
    COALESCE(SUM(delta) FILTER (WHERE location = 'main'), 0)::int AS ledger_main,
    COALESCE(SUM(delta) FILTER (WHERE location = 'incubator'), 0)::int AS ledger_incubator
  FROM public.inventory_movements
  GROUP BY variant_id
),
variant_drift_analysis AS (
  SELECT
    pv.id AS variant_id,
    pv.brand_id,
    COALESCE(pv.stock_main, 0) AS cached_stock_main,
    COALESCE(la.ledger_main, 0) AS ledger_stock_main,
    COALESCE(pv.stock_incubator, 0) AS cached_stock_incubator,
    COALESCE(la.ledger_incubator, 0) AS ledger_stock_incubator,
    (COALESCE(pv.stock_main, 0) - COALESCE(la.ledger_main, 0)) AS main_drift,
    (COALESCE(pv.stock_incubator, 0) - COALESCE(la.ledger_incubator, 0)) AS incubator_drift
  FROM public.product_variants pv
  LEFT JOIN ledger_aggregates la ON la.variant_id = pv.id
)
SELECT
  variant_id,
  brand_id,
  cached_stock_main,
  ledger_stock_main,
  cached_stock_incubator,
  ledger_stock_incubator,
  main_drift,
  incubator_drift,
  CASE
    WHEN main_drift = 0 AND incubator_drift = 0 THEN 'INVARIANT_HOLDS'
    ELSE 'DRIFT_DETECTED'
  END AS ledger_status
FROM variant_drift_analysis
WHERE main_drift <> 0 OR incubator_drift <> 0;

