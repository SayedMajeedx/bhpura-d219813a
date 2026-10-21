-- ==============================================================================
-- The report's figures for several periods in one request: the monthly statement.
--
-- The Reports overview puts its figures together from five functions (the overview, processed
-- returns, cost of goods, payment fees and partner sales; `composeOverviewRow` in
-- `src/lib/reporting-compose.ts`). A statement of twelve months side by side, and the same
-- twelve a year earlier, would be 120 requests from the browser to a database in another region.
-- `rpc_reporting_periods` runs the same five functions for each period given and returns their
-- answers as they are, so the statement is composed by the very rule the overview uses and the
-- two always agree.
--
-- It runs with the caller's own rights (SECURITY INVOKER): each function it calls checks the
-- caller itself (`reporting_brand_id`: signed in, active, `view_financials`, the caller's store),
-- so it grants nothing a caller could not already ask for one period at a time.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_reporting_periods(
  p_periods jsonb,
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_period jsonb;
  v_from timestamptz;
  v_to timestamptz;
  v_incubator jsonb;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF p_periods IS NULL OR jsonb_typeof(p_periods) <> 'array'
     OR jsonb_array_length(p_periods) = 0 OR jsonb_array_length(p_periods) > 36 THEN
    RAISE EXCEPTION 'INVALID_PERIODS';
  END IF;

  FOR v_period IN SELECT value FROM jsonb_array_elements(p_periods) LOOP
    v_from := (v_period ->> 'from')::timestamptz;
    v_to := (v_period ->> 'to')::timestamptz;
    IF v_from IS NULL OR v_to IS NULL OR v_to <= v_from THEN
      RAISE EXCEPTION 'INVALID_PERIODS';
    END IF;

    v_incubator := public.rpc_reporting_incubator_sales(v_from, v_to, p_tz, 'year', p_brand_slug);

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'overview', public.rpc_reporting_overview(v_from, v_to, p_tz, p_include_historical, p_brand_slug),
      'returns', public.rpc_reporting_processed_returns(v_from, v_to, p_tz, p_brand_slug),
      'cogs', public.rpc_reporting_order_cogs(v_from, v_to, p_include_historical, p_brand_slug),
      'fees', public.rpc_reporting_processing_fees(v_from, v_to, p_include_historical, p_brand_slug),
      'incubator_summary', COALESCE(v_incubator -> 'summary', '[]'::jsonb)
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_periods(jsonb, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_periods(jsonb, text, boolean, text)
  TO authenticated, service_role;
