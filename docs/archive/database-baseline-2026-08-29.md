# Production database baseline — 2026-08-29

The production schema and local migration history were reconciled without executing application DDL or modifying business rows.

## Verification performed

- Read-only production schema inventory captured during the maintenance session.
- All checks in `scripts/database/production-feature-probes.sql` returned `true` before and after reconciliation.
- Local and remote migration lists matched after reconciliation.
- The duplicate local version `20260825193000` was resolved: `reporting_dashboard_consistency` retained the production version, and `returning_customer_promo_eligibility` moved to `20260825193500`.

## Superseded SQL-editor history removed from the ledger

These versions were partial or duplicate SQL-editor records whose final schema is represented by canonical local migrations:

- `20260816190829`
- `20260816190905`
- `20260816191752`
- `20260825155205`
- `20260827212411`

## Recovery note

If this ledger-only reconciliation ever needs to be reversed, first confirm the production schema has not changed. Mark the five versions above as applied, then mark the canonical versions introduced into the ledger during this reconciliation as reverted. This affects migration bookkeeping only; it does not restore or alter schema/data. Prefer a new forward reconciliation after inspecting `supabase_migrations.schema_migrations` rather than applying these instructions blindly.
