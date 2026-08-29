# Database migration and recovery runbook

This runbook protects the live Boutq database from schema drift. Production changes must be additive, reviewed, and represented by exactly one timestamped file in `supabase/migrations`.

## Safety rules

1. Never run `db reset` against a linked or production project.
2. Never use `db push` while `supabase migration list` contains unexplained local-only, remote-only, or duplicate versions.
3. Take or verify a restorable production backup before destructive DDL, column type changes, or data rewrites.
4. Prefer additive migrations and staged deprecation. Keep application code compatible with both the old and new schema during rollout.
5. Migration history repair changes the ledger only. Run it only after read-only probes prove that the migration's final schema is already present.

## Pre-deployment checks

```sh
npm run db:migrations:check
npx supabase migration list
npx supabase db query --linked --file scripts/database/production-feature-probes.sql
```

Save the output of `production-schema-inventory.sql` outside the repository as the before-change schema manifest. It contains schema metadata, not business rows.

## Deployment sequence

1. Verify the managed production backup and its retention window in Supabase.
2. Apply the migration in staging or an isolated local Supabase project.
3. Run unit, build, browser smoke, and migration checks.
4. Apply one migration batch to production.
5. Run the feature probes and critical user journeys immediately.
6. Record the migration version, operator, time, verification result, and backup reference.

## Rollback strategy

- Application regression: redeploy the previous application release first.
- Additive schema regression: leave compatible columns/tables in place and deploy a forward-fix migration.
- Destructive or data regression: stop writes affecting the damaged scope, capture evidence, and restore to a new database from the verified backup. Validate it before changing production routing.
- Never delete an already-shared migration file or reuse its timestamp. Correct mistakes with a new forward migration.

## Restore drill

At least quarterly, restore the latest production backup to an isolated project, run `production-feature-probes.sql`, compare the schema inventory, and exercise login, checkout, order status, reporting, review rewards, inventory, accounting, and push-notification registration. Record recovery point and recovery time results.
