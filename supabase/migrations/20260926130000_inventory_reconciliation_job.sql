-- ==============================================================================
-- Inventory Reconciliation Job & Scheduled Cron
-- Audits cached variant columns against authoritative ledger sums
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_inventory(p_brand_id uuid DEFAULT NULL)
RETURNS public.inventory_reconciliation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_started_at timestamptz := now();
  v_variants_checked integer := 0;
  v_drift_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_variant record;
  v_main_ledger_sum integer;
  v_inc_ledger_sum integer;
  v_main_diff integer;
  v_inc_diff integer;
  v_run public.inventory_reconciliation_runs;
BEGIN
  IF auth.uid() IS NOT NULL AND p_brand_id IS NOT NULL AND NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  INSERT INTO public.inventory_reconciliation_runs (
    brand_id, started_at, variants_checked, drift_count, details
  ) VALUES (
    p_brand_id, v_started_at, 0, 0, '[]'::jsonb
  ) RETURNING id INTO v_run_id;

  FOR v_variant IN
    SELECT id, brand_id, COALESCE(stock_main, 0) AS stock_main, COALESCE(stock_incubator, 0) AS stock_incubator
    FROM public.product_variants
    WHERE (p_brand_id IS NULL OR brand_id = p_brand_id)
  LOOP
    v_variants_checked := v_variants_checked + 1;

    -- Calculate sum of all ledger movements
    SELECT COALESCE(SUM(delta), 0) INTO v_main_ledger_sum
    FROM public.inventory_movements
    WHERE variant_id = v_variant.id AND location = 'main';

    SELECT COALESCE(SUM(delta), 0) INTO v_inc_ledger_sum
    FROM public.inventory_movements
    WHERE variant_id = v_variant.id AND location = 'incubator';

    v_main_diff := v_variant.stock_main - v_main_ledger_sum;
    v_inc_diff := v_variant.stock_incubator - v_inc_ledger_sum;

    IF v_main_diff <> 0 OR v_inc_diff <> 0 THEN
      v_drift_count := v_drift_count + 1;
      v_details := v_details || jsonb_build_object(
        'variant_id', v_variant.id,
        'stock_main_cached', v_variant.stock_main,
        'stock_main_ledger', v_main_ledger_sum,
        'stock_incubator_cached', v_variant.stock_incubator,
        'stock_incubator_ledger', v_inc_ledger_sum
      );

      -- Correct the cached column to match authoritative ledger sum (never alter ledger history)
      PERFORM set_config('inventory.apply_via_ledger', '1', true);

      UPDATE public.product_variants
      SET stock_main = v_main_ledger_sum,
          stock_incubator = v_inc_ledger_sum,
          updated_at = now()
      WHERE id = v_variant.id;
    END IF;
  END LOOP;

  UPDATE public.inventory_reconciliation_runs
  SET finished_at = now(),
      variants_checked = v_variants_checked,
      drift_count = v_drift_count,
      details = v_details
  WHERE id = v_run_id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_inventory FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory TO authenticated, service_role;

-- Schedule nightly via pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inventory_reconciliation_nightly') THEN
      PERFORM cron.unschedule('inventory_reconciliation_nightly');
    END IF;

    PERFORM cron.schedule(
      'inventory_reconciliation_nightly',
      '0 3 * * *',
      'SELECT public.reconcile_inventory();'
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
