-- The shared translation cache is written by the server only, and only for words a store sells.
--
-- Option values (a colour, a fabric, a flavour) are translated once and kept in
-- `translation_cache`, which every storefront reads. Two things were open:
--
-- 1. Any signed-in account, a shopper's included, could insert or rewrite a row: the policies
--    said `WITH CHECK (true)` for `authenticated`. One account could change what "Black" reads
--    as on every store. The server function that fills the cache uses the service role, which
--    needs no policy, so the two write policies go and the write grants with them. (Checked
--    before writing this: the cache holds 18 short rows, nothing odd.)
--
-- 2. The function that fills it is public (a shopper's page asks for the words it has not seen)
--    and sent whatever it was given to the paid translation model. It now asks this function
--    first and translates only the words a store really sells under: an option value of a
--    variant, or a product's fabric or occasion. catalog_option_values(terms) returns those of
--    the given words that are.

DROP POLICY IF EXISTS "Authenticated users can insert translation cache" ON public.translation_cache;
DROP POLICY IF EXISTS "Authenticated users can update translation cache" ON public.translation_cache;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.translation_cache FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.catalog_option_values(p_terms text[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT term), '{}'::text[])
  FROM unnest(COALESCE(p_terms, '{}'::text[])) AS term
  WHERE EXISTS (
      SELECT 1
      FROM public.product_variants v
      WHERE term IN (v.size, v.color, v.fabric, v.option_four, v.option_five)
    )
    OR EXISTS (
      -- A product's own fabric and occasion are shown translated too.
      SELECT 1 FROM public.products p WHERE term IN (p.fabric_type, p.occasion)
    );
$$;

COMMENT ON FUNCTION public.catalog_option_values(text[]) IS
  'Which of the given words are an option value of some product. The translation function asks it before paying to translate a word.';

-- Only the server asks.
REVOKE ALL ON FUNCTION public.catalog_option_values(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_option_values(text[]) TO service_role;
