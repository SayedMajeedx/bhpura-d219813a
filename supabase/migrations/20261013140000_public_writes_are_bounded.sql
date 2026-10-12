-- What a visitor may write straight into the database is bounded.
--
-- Two tables let anyone insert a row with no condition at all (`WITH CHECK (true)`).
--
-- 1. tenant_requests (a request to open a store). The form saves through the server, which
--    checks the request and limits how often one address can ask; nothing in the app inserts
--    from the browser. The open policy let anyone bypass all of that and write any row,
--    including one already marked approved and paid. (It could not open a store: that happens
--    only when a super admin changes a request's status.) The policy and the browser's write
--    grants go; the server writes with the service role, which needs neither.
--
-- 2. shared_carts (a short link to a cart). The browser does write these, so the insert stays,
--    but a row must now look like a shared cart: a short code and a list of at most 100 lines
--    no bigger than 256 KB (the biggest today is 3 KB for four lines). A visitor sets the code, the store and the lines and nothing else:
--    the id, the creation time and the 90-day expiry are the table's own. They are read only
--    through get_shared_cart_by_code, so the browser's other grants go too.
--    Expired links were never removed: a nightly job now deletes them.

-- ── Store requests: written by the server only ──────────────────────────────
DROP POLICY IF EXISTS "Allow public insert to tenant_requests" ON public.tenant_requests;
REVOKE INSERT, TRUNCATE ON public.tenant_requests FROM anon, authenticated;

-- ── Shared carts: a visitor's row must look like one ────────────────────────
ALTER TABLE public.shared_carts
  DROP CONSTRAINT IF EXISTS shared_carts_code_shape,
  DROP CONSTRAINT IF EXISTS shared_carts_items_bounded,
  DROP CONSTRAINT IF EXISTS shared_carts_slug_bounded;

ALTER TABLE public.shared_carts
  ADD CONSTRAINT shared_carts_code_shape CHECK (code ~ '^[a-z0-9]{4,12}$'),
  ADD CONSTRAINT shared_carts_items_bounded CHECK (
    CASE
      WHEN jsonb_typeof(items) = 'array'
        THEN jsonb_array_length(items) BETWEEN 1 AND 100 AND octet_length(items::text) <= 262144
      ELSE false
    END
  ),
  ADD CONSTRAINT shared_carts_slug_bounded CHECK (char_length(brand_slug) BETWEEN 1 AND 80);

-- Only the four columns a shared cart is made of: the rest take the table's defaults, so a
-- visitor cannot write a link that never expires.
REVOKE ALL ON public.shared_carts FROM anon, authenticated;
GRANT INSERT (code, brand_id, brand_slug, items) ON public.shared_carts TO anon, authenticated;

-- Expired links are removed every night.
CREATE OR REPLACE FUNCTION public.delete_expired_shared_carts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.shared_carts WHERE expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- The scheduler runs it; nobody calls it by hand.
REVOKE ALL ON FUNCTION public.delete_expired_shared_carts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_shared_carts() TO service_role;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shared_carts_cleanup_nightly') THEN
      PERFORM cron.unschedule('shared_carts_cleanup_nightly');
    END IF;
    PERFORM cron.schedule(
      'shared_carts_cleanup_nightly',
      '23 3 * * *',
      'SELECT public.delete_expired_shared_carts();'
    );
  END IF;
END $$;
