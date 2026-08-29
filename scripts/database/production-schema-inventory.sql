-- Read-only production schema inventory used by the recovery/migration audit.
-- It intentionally excludes row data and secrets.
SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', table_schema,
      'table', table_name
    ) ORDER BY table_schema, table_name)
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ),
  'columns', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', table_name,
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) ORDER BY table_name, ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
  ),
  'functions', (
    SELECT jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'identity_args', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef
    ) ORDER BY p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ),
  'policies', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', policyname,
      'roles', roles,
      'command', cmd
    ) ORDER BY tablename, policyname)
    FROM pg_policies
    WHERE schemaname = 'public'
  ),
  'triggers', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', event_object_table,
      'name', trigger_name,
      'event', event_manipulation,
      'timing', action_timing
    ) ORDER BY event_object_table, trigger_name, event_manipulation)
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  ),
  'indexes', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', indexname
    ) ORDER BY tablename, indexname)
    FROM pg_indexes
    WHERE schemaname = 'public'
  ),
  'rls', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'enabled', c.relrowsecurity,
      'forced', c.relforcerowsecurity
    ) ORDER BY c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  )
) AS schema_inventory;
