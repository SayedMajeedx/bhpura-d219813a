-- Read-only recovery query. The result lets us reconstruct migration files that
-- exist in production history but are absent from source control.
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260816190829',
  '20260816190905',
  '20260816191752',
  '20260825155205',
  '20260827212411'
)
ORDER BY version;
