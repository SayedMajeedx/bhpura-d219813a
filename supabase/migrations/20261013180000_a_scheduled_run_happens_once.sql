-- A scheduled run happens once, however many times it is started.
--
-- The worker's scheduler is started by Cloudflare, every minute and once a day. Since
-- 2026-10-12 22:46 UTC Cloudflare starts every run twice, a few seconds apart (two registrations
-- of the same schedule, at seconds :08 and :24 of each minute; a fresh deployment did not clear
-- it). The four recovery tasks and the two daily ones then run twice at once.
--
-- Whatever starts it, a run now claims its minute first, here, and a second start for the same
-- schedule and minute finds the claim taken and does nothing. The worker runs anyway when it
-- cannot reach this function (a recovery loop must not stop because a guard is unreachable).

CREATE TABLE IF NOT EXISTS public.scheduled_runs (
  cron text NOT NULL,
  run_minute timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cron, run_minute)
);

-- The server's only: no policy, and no grant to a browser.
ALTER TABLE public.scheduled_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_runs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_scheduled_run(p_cron text, p_run_minute timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute timestamptz := date_trunc('minute', p_run_minute);
  v_claimed integer;
BEGIN
  IF p_cron IS NULL OR btrim(p_cron) = '' OR p_run_minute IS NULL THEN
    RAISE EXCEPTION 'SCHEDULED_RUN_NEEDS_A_SCHEDULE_AND_A_TIME';
  END IF;

  INSERT INTO public.scheduled_runs (cron, run_minute)
  VALUES (p_cron, v_minute)
  ON CONFLICT (cron, run_minute) DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  -- Claims are needed for a minute; they are kept two days and cleared on the hour.
  IF v_claimed = 1 AND extract(minute FROM v_minute) = 0 THEN
    DELETE FROM public.scheduled_runs WHERE run_minute < now() - interval '2 days';
  END IF;

  RETURN v_claimed = 1;
END;
$$;

-- The worker calls it with the service role; nobody else.
REVOKE ALL ON FUNCTION public.claim_scheduled_run(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_run(text, timestamptz) TO service_role;
