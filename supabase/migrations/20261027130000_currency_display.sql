-- Prices shown in a shopper's own Gulf currency (the owner's request of 2026-10-27, after
-- comparing Boutq with another platform). Display only: an order is placed, paid, invoiced and
-- reported in the store's own currency, as before. A store chooses which currencies its shoppers
-- may switch to (none by default); a price then reads "≈ 312 SAR" beside the real one.
--
--   * exchange_rates: how many of each currency one US dollar buys. The Gulf currencies but the
--     Kuwaiti dinar are pegged to the dollar; the worker's daily task refreshes every rate
--     (src/lib/exchange-rates.server.ts) and refuses a figure that jumped. Seeded with the pegs.
--     Written by the server only; read through storefront_currency_display.
--   * business_settings.display_currencies: the currencies a store's shoppers may switch to.

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  currency text PRIMARY KEY
    CHECK (currency IN ('BHD', 'SAR', 'AED', 'KWD', 'QAR', 'OMR', 'USD')),
  per_usd numeric(18,8) NOT NULL CHECK (per_usd > 0),
  source text NOT NULL DEFAULT 'peg' CHECK (char_length(source) <= 40),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
-- No policy: no browser reads or writes the table itself.
REVOKE ALL ON public.exchange_rates FROM anon, authenticated;

INSERT INTO public.exchange_rates (currency, per_usd, source) VALUES
  ('USD', 1, 'peg'),
  ('BHD', 0.376, 'peg'),
  ('SAR', 3.75, 'peg'),
  ('AED', 3.6725, 'peg'),
  ('QAR', 3.64, 'peg'),
  ('OMR', 0.3845, 'peg'),
  ('KWD', 0.3075, 'seed')
ON CONFLICT (currency) DO NOTHING;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS display_currencies text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_display_currencies_known;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_display_currencies_known
  CHECK (display_currencies <@ ARRAY['BHD', 'SAR', 'AED', 'KWD', 'QAR', 'OMR', 'USD']::text[]);

COMMENT ON COLUMN public.business_settings.display_currencies IS
  'Currencies a shopper may see prices in (≈, display only); the store charges in its own currency.';

-- What a shopper needs to show a price in another currency: the store's own currency, the ones it
-- offers, and the rates (per US dollar) of those, with when they were last refreshed. Nothing for
-- a store that offers none.
CREATE OR REPLACE FUNCTION public.storefront_currency_display(p_brand_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'store', upper(COALESCE(s.currency, 'BHD')),
    'currencies', to_jsonb(s.display_currencies),
    'rates', COALESCE((
      SELECT jsonb_object_agg(r.currency, r.per_usd)
        FROM public.exchange_rates r
       WHERE r.currency = ANY (s.display_currencies || upper(COALESCE(s.currency, 'BHD')))
    ), '{}'::jsonb),
    'updated_at', (
      SELECT max(r.updated_at) FROM public.exchange_rates r
       WHERE r.currency = ANY (s.display_currencies)
    )
  )
  FROM public.business_settings s
  JOIN public.brands b ON b.id = s.brand_id AND b.is_active
  WHERE b.slug = p_brand_slug
    AND cardinality(s.display_currencies) > 0
$$;

GRANT EXECUTE ON FUNCTION public.storefront_currency_display(text) TO anon, authenticated;
