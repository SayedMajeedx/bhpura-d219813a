-- The scheduler proves who it is to the functions it calls.
--
-- Two jobs call an edge function every minute: send-customer-push (a shopper's notifications)
-- and send-mobile-push (the staff app's). They were created by hand and send only the
-- publishable key, which is public. The functions' code has since required the service-role key
-- or a shared secret (CRON_SECRET, in the x-cron-secret header), but the deployed copies were
-- older and asked for nothing. When send-customer-push was deployed again on 2026-10-11 the
-- scheduler's calls were refused ("Unauthorized") and its queue stopped being processed; the
-- same would happen to send-mobile-push the day it is deployed.
--
-- This adds the x-cron-secret header to both jobs. The secret is not written here or in the
-- job: the job reads it from Vault (the entry named cron_secret) each time it runs, and the
-- owner sets the same value as the functions' CRON_SECRET. Until both exist the header is empty
-- and the function refuses, as it does now. The publishable key stays as the bearer (the
-- gateway asks for a key). A job that already sends the header, or does not exist, is left
-- alone, so this can be run again.

DO $$
DECLARE
  v_job record;
  v_header constant text :=
    ' || jsonb_build_object(''x-cron-secret'', COALESCE('
    || '(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''cron_secret''), ''''))';
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR v_job IN
    SELECT jobid, command
    FROM cron.job
    WHERE jobname IN ('send-customer-push-every-minute', 'process-boutq-mobile-push')
      AND command NOT ILIKE '%x-cron-secret%'
      -- One "headers := <expression>, body :=" in the call: the header joins that expression.
      AND (length(command) - length(replace(command, ', body :=', ''))) = length(', body :=')
  LOOP
    PERFORM cron.alter_job(
      job_id := v_job.jobid,
      command := replace(v_job.command, ', body :=', v_header || ', body :=')
    );
  END LOOP;
END $$;
