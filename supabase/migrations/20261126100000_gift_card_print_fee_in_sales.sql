-- The store's fee for printing and delivering a gift card counts in its sales (the owner's decision
-- of 2026-11-09): it is a service the store sells, so the statement's net sales, its operating
-- profit and the VAT it collected include it, on the day the purchase was paid. The card's own
-- value stays money held until it is spent (step three of docs/gift-cards-plan.md).
--
-- The fee the store writes is what the shopper pays. For a store that charges VAT (a VAT number
-- and a rate, held by trg_business_settings_vat_needs_number), the VAT is inside it: the rate is
-- kept on the purchase when it is made (`print_tax_rate`), so a later change of rate never moves a
-- month already reported, and the net sale is fee * 100 / (100 + rate).

-- 1. The rate, kept on the purchase -------------------------------------------------------------

ALTER TABLE public.gift_card_purchases
  ADD COLUMN IF NOT EXISTS print_tax_rate numeric(6, 3) NOT NULL DEFAULT 0;
ALTER TABLE public.gift_card_purchases DROP CONSTRAINT IF EXISTS gift_card_purchases_print_tax_rate_check;
ALTER TABLE public.gift_card_purchases
  ADD CONSTRAINT gift_card_purchases_print_tax_rate_check CHECK (print_tax_rate >= 0 AND print_tax_rate <= 100);
GRANT SELECT (print_tax_rate) ON public.gift_card_purchases TO authenticated;

CREATE OR REPLACE FUNCTION public.gift_card_purchases_print_tax_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.print_by_store AND COALESCE(NEW.print_fee, 0) > 0 THEN
    SELECT GREATEST(0, LEAST(100, COALESCE(bs.default_tax_rate, 0)))
      INTO NEW.print_tax_rate
      FROM public.business_settings bs
     WHERE bs.brand_id = NEW.brand_id;
    NEW.print_tax_rate := COALESCE(NEW.print_tax_rate, 0);
  ELSE
    NEW.print_tax_rate := 0;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_purchases_print_tax_rate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gift_card_purchases_print_tax_rate ON public.gift_card_purchases;
CREATE TRIGGER trg_gift_card_purchases_print_tax_rate
BEFORE INSERT ON public.gift_card_purchases
FOR EACH ROW EXECUTE FUNCTION public.gift_card_purchases_print_tax_rate();

-- Purchases made since the store began printing take the store's rate as it is now.
UPDATE public.gift_card_purchases p
   SET print_tax_rate = GREATEST(0, LEAST(100, COALESCE(bs.default_tax_rate, 0)))
  FROM public.business_settings bs
 WHERE bs.brand_id = p.brand_id AND p.print_by_store AND p.print_fee > 0 AND p.print_tax_rate = 0;

-- 2. The service's sales for a period, by currency ----------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_reporting_gift_card_services(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_brand_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'currency', s.currency,
      'service_gross', s.gross,
      'service_sales', s.net,
      'service_vat', s.gross - s.net,
      'service_count', s.n
    ) ORDER BY s.currency)
    FROM (
      SELECT p.currency,
             sum(p.print_fee) AS gross,
             sum(p.print_fee * 100 / (100 + p.print_tax_rate)) AS net,
             count(*) AS n
        FROM public.gift_card_purchases p
       WHERE p.brand_id = v_brand AND p.status = 'paid' AND p.print_by_store AND p.print_fee > 0
         AND p.paid_at >= p_start_date AND p.paid_at < p_end_date
       GROUP BY p.currency
    ) s
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_reporting_gift_card_services(timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_gift_card_services(timestamptz, timestamptz, text)
  TO authenticated, service_role;

-- 3. The monthly statement's one request (migration 20261021150000's function) asks it too -------

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
      'incubator_summary', COALESCE(v_incubator -> 'summary', '[]'::jsonb),
      'services', public.rpc_reporting_gift_card_services(v_from, v_to, p_brand_slug)
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_periods(jsonb, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_periods(jsonb, text, boolean, text)
  TO authenticated, service_role;
