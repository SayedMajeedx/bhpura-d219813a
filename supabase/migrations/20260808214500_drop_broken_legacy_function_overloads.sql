-- The production schema contained legacy overloads alongside the canonical
-- reporting/onboarding functions repaired in 20260808211000.  They still
-- referenced removed tables or invalid SQL, so remove only non-canonical
-- signatures.  Deliberately omit CASCADE: any unexpected dependency aborts
-- the migration instead of being removed implicitly.
DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_reporting_overview',
        'rpc_reporting_expenses',
        'rpc_reporting_export',
        'create_tenant_with_defaults'
      )
      AND NOT (
        (
          p.proname = 'rpc_reporting_overview'
          AND oidvectortypes(p.proargtypes) =
            'timestamp with time zone, timestamp with time zone, text, boolean, text'
        )
        OR (
          p.proname = 'rpc_reporting_expenses'
          AND oidvectortypes(p.proargtypes) =
            'timestamp with time zone, timestamp with time zone, text, text'
        )
        OR (
          p.proname = 'rpc_reporting_export'
          AND oidvectortypes(p.proargtypes) =
            'text, timestamp with time zone, timestamp with time zone, text, text'
        )
        OR (
          p.proname = 'create_tenant_with_defaults'
          AND oidvectortypes(p.proargtypes) = 'text, text, text, text, uuid, text'
        )
      )
  LOOP
    EXECUTE format('DROP FUNCTION %s', v_function);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
