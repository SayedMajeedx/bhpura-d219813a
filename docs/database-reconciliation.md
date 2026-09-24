# Database Migration Reconciliation Report

> **Document Status**: Complete Read-Only Schema Audit  
> **Date**: September 24, 2026  
> **Target Environment**: Production Supabase (`linked`)  
> **Authoritative Baseline Branch**: `database/migration-reconciliation`  
> **Phase**: Maintainability Roadmap — Phase 2 (STOP before writes)

---

## 1. Executive Summary

As required by **Phase 2** of the Maintainability Roadmap, a comprehensive, read-only audit of the database schema migrations was conducted by comparing local migration files (`supabase/migrations/`) against the remote database ledger (`supabase_migrations.schema_migrations`) and the live PostgreSQL catalog (`pg_catalog`, `information_schema`, `pg_proc`, `pg_trigger`, `pg_constraint`).

### Baseline Drift Counts

| Category                     | Count   | Status Summary                                                                                     |
| :--------------------------- | :------ | :------------------------------------------------------------------------------------------------- |
| **Synced Migrations**        | **228** | Perfectly matched between repository and remote ledger                                             |
| **Remote-Only Versions**     | **23**  | Applied on remote under legacy/different timestamps, but 100% represented in local migration files |
| **Local-Only Migrations**    | **32**  | 23 match the remote-only versions above; 9 were applied to production without ledger registration  |
| **Total Repository Files**   | **260** | Canonical migration files in `supabase/migrations/`                                                |
| **Total Remote Ledger Rows** | **251** | Entries in `supabase_migrations.schema_migrations`                                                 |

### Core Finding

> [!IMPORTANT]
> **Schema Drift is 0%. Ledger Drift is 100% accounted for.**
>
> Detailed inspection of the live PostgreSQL catalog confirms that **every single DDL and schema object** defined across all 32 local-only migrations is **already fully applied in the live production database**. No tables, columns, constraints, triggers, or functions are missing.
>
> The discrepancy is purely an **administrative ledger mismatch** in `supabase_migrations.schema_migrations`:
>
> 1. **23 migrations** were recorded in the remote ledger under unnormalized or earlier timestamps (`20260909132241`, etc.) while the repository standardized them into rounded timestamps (`20260909163000`, etc.).
> 2. **9 migrations** (covering critical checkout email snapshotting, password change flags, and the complete inventory ledger rewrite) were executed directly on production without inserting rows into `supabase_migrations.schema_migrations`.

---

## 2. Detailed Audit: The 23 Remote-Only Migrations

All 23 remote-only ledger rows correspond 1:1 with files in `supabase/migrations/`. In 18 cases, the DDL statements in the remote ledger match the local file byte-for-byte. In the remaining 5 cases, the DDL is identical and differs only by explanatory comments added to the local file.

| Remote Version   | Remote Migration Name                                           | Local Migration File                                                | DDL Equivalence                           | Live Schema Evidence                                                                                                             |
| :--------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------ | :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `20260909132241` | `add_footer_logo_size`                                          | `20260909163000_add_footer_logo_size.sql`                           | **Exact byte match**                      | `business_settings.footer_logo_size` exists; `brand_public_settings` includes column.                                            |
| `20260910093402` | `20260910130000_security_hardening_rls_and_permissions`         | `20260910130000_security_hardening_rls_and_permissions.sql`         | **Exact byte match**                      | Security policies on `profiles`, `staff_roles`, `user_roles` validated.                                                          |
| `20260910093532` | `20260910133000_performance_covering_indexes`                   | `20260910133000_performance_covering_indexes.sql`                   | **Exact byte match**                      | Covering indexes on `orders`, `products`, `customers` present in `pg_indexes`.                                                   |
| `20260910093649` | `20260910140000_optimize_rls_initplan`                          | `20260910140000_optimize_rls_initplan.sql`                          | **Exact byte match**                      | InitPlan subquery wraps present in `pg_policies`.                                                                                |
| `20260912082249` | `20260912120000_remediate_audit_security_and_rls`               | `20260912120000_remediate_audit_security_and_rls.sql`               | **DDL Identical** (comments only)         | Function `get_shared_cart_by_code` exists; anon SELECT on `brands` restricted.                                                   |
| `20260913135522` | `20260913100000_storefront_mode_catalog`                        | `20260913100000_storefront_mode_catalog.sql`                        | **Exact byte match**                      | `business_settings.storefront_mode` enum & column present.                                                                       |
| `20260913135535` | `20260913120000_catalog_inquiry_tracking`                       | `20260913120000_catalog_inquiry_tracking.sql`                       | **Exact byte match**                      | Table `public.catalog_inquiries` exists with RLS.                                                                                |
| `20260914064846` | `20260914100000_fix_engagement_views_and_inquiries_consistency` | `20260914100000_fix_engagement_views_and_inquiries_consistency.sql` | **Exact byte match**                      | Engagement analytics RPCs and counters verified.                                                                                 |
| `20260914150454` | `20260915100000_store_vertical_and_modules`                     | `20260915100000_store_vertical_and_modules.sql`                     | **Exact byte match**                      | `business_settings.store_vertical` and `enabled_modules` exist.                                                                  |
| `20260914150633` | `20260916100000_size_guides`                                    | `20260916100000_size_guides.sql`                                    | **Exact byte match**                      | Table `public.size_guides` exists with foreign keys to products.                                                                 |
| `20260914150725` | `20260917100000_products_made_to_order_flag`                    | `20260917100000_products_made_to_order_flag.sql`                    | **Exact byte match**                      | `products.is_made_to_order` and `lead_time_days` columns exist.                                                                  |
| `20260914150743` | `20260918100000_fit_profiles_config`                            | `20260918100000_fit_profiles_config.sql`                            | **Exact byte match**                      | Table `public.fit_profiles` exists with tenant policies.                                                                         |
| `20260914150814` | `20260919100000_brand_addons_platform`                          | `20260919100000_brand_addons_platform.sql`                          | **Exact byte match**                      | Tables `public.addons` and `public.brand_addons` exist.                                                                          |
| `20260914150855` | `20260920100000_addon_store_and_policies`                       | `20260920100000_addon_store_and_policies.sql`                       | **Exact byte match**                      | Addon store policies and installation RPCs active.                                                                               |
| `20260915052301` | `20260921100000_brand_public_addons_view`                       | `20260921100000_brand_public_addons_view.sql`                       | **DDL Identical** (comments only)         | View `public.brand_public_addons` exists; `get_storefront_page_data` updated.                                                    |
| `20260917092827` | `20260922130000_merchant_grant_applications`                    | `20260922130000_merchant_grant_applications.sql`                    | **Exact byte match**                      | Table `public.merchant_grant_applications` exists with RLS.                                                                      |
| `20260917182820` | `add_coffee_vertical`                                           | `20260922100000_add_coffee_vertical.sql`                            | **DDL Identical** (comments only)         | `business_settings.store_vertical` check constraint permits `'coffee'`.                                                          |
| `20260918075330` | `20260922120000_export_runs_audit`                              | `20260922120000_export_runs_audit.sql`                              | **Exact byte match**                      | Table `public.export_runs` exists with audit triggers.                                                                           |
| `20260918080745` | `20260922140000_invoice_customization_enhancements`             | `20260922140000_invoice_customization_enhancements.sql`             | **DDL Identical** (column comments added) | Columns `invoice_show_business_name`, `invoice_show_terms`, `invoice_terms_ar`, `invoice_terms_en` exist on `business_settings`. |
| `20260920162143` | `20260924100000_brand_wizard_provisioning`                      | `20260924100000_brand_wizard_provisioning.sql`                      | **Exact byte match**                      | Wizard provisioning procedures verified in `pg_proc`.                                                                            |
| `20260920162255` | `20260925100000_storefront_v2`                                  | `20260925100000_storefront_v2.sql`                                  | **Exact byte match**                      | Storefront V2 settings and typography columns exist in `business_settings`.                                                      |
| `20260923103823` | `storefront_hero_and_gallery_display_options`                   | `20260928120000_storefront_hero_and_gallery_display_options.sql`    | **Exact byte match**                      | Hero and gallery display layout options exist in `business_settings`.                                                            |
| `20260923105850` | `hero_video_fit`                                                | `20260928140000_hero_video_fit.sql`                                 | **DDL Identical** (header comment added)  | `business_settings.hero_video_fit` exists; `brand_public_settings` exposes it.                                                   |

---

## 3. Detailed Audit: The 9 Remaining Local-Only Migrations

These 9 migrations were added to the codebase to fix checkout contact overwrites, add first-time password reset security, eliminate duplicate order triggers, and implement the comprehensive append-only inventory ledger architecture.

Live schema inspection confirms that **all 9 migrations have already been executed in production**:

| Local Version    | Migration File Name                                            | Production Status   | Live Schema Verification & Evidence                                                                                                                                                                                                                                                               |
| :--------------- | :------------------------------------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260918170000` | `20260918170000_fix_order_contact_snapshot_checkout_email.sql` | **ALREADY APPLIED** | `preserve_order_contact_snapshot()` trigger function exists and protects snapshot values; `place_storefront_order_core()` atomically captures customer contact snapshots.                                                                                                                         |
| `20260923100000` | `20260923100000_profiles_must_change_password.sql`             | **ALREADY APPLIED** | Column `profiles.must_change_password` exists (`boolean`, `not null`, default `false`); RPC `complete_first_sign_in_password_change` exists and is granted to `authenticated`.                                                                                                                    |
| `20260925110000` | `20260925110000_drop_duplicate_order_delete_trigger.sql`       | **ALREADY APPLIED** | Duplicate trigger `orders_restore_stock_on_delete_trg` is verified **absent**; single delete trigger `trg_orders_inventory_delete` (`trg_orders_inventory_delete_proc`) is active.                                                                                                                |
| `20260925113000` | `20260925113000_fix_return_and_cart_stock_columns.sql`         | **ALREADY APPLIED** | Functions `rpc_inspect_and_restock_return_item` and `rpc_validate_and_restore_abandoned_cart` reference `stock_main` and `stock_incubator`; obsolete references to `stock_quantity` removed.                                                                                                      |
| `20260926100000` | `20260926100000_inventory_movements_and_allocations.sql`       | **ALREADY APPLIED** | Tables `public.inventory_movements`, `public.order_inventory_allocations`, and `public.inventory_reconciliation_runs` exist with RLS enabled; constraint `product_variants_stock_nonnegative` is present and `VALIDATED`; columns `orders.inventory_state` and `orders.inventory_revision` exist. |
| `20260926110000` | `20260926110000_inventory_ledger_functions.sql`                | **ALREADY APPLIED** | Functions `apply_inventory_movement` and `rpc_adjust_variant_stock` exist; trigger `trg_guard_product_variants_stock_update` on `product_variants` is active; direct column updates to `stock_main` and `stock_incubator` are revoked.                                                            |
| `20260926120000` | `20260926120000_order_inventory_state_machine.sql`             | **ALREADY APPLIED** | State machine functions `order_inventory_desired_state` and `order_inventory_transition` exist and manage order stock states.                                                                                                                                                                     |
| `20260926130000` | `20260926130000_inventory_reconciliation_job.sql`              | **ALREADY APPLIED** | Audit function `public.reconcile_inventory(uuid)` exists in production.                                                                                                                                                                                                                           |
| `20260927100000` | `20260927100000_cleanup_legacy_inventory_artifacts.sql`        | **ALREADY APPLIED** | Legacy functions `orders_restore_stock_on_delete`, `restore_order_stock_on_cancel`, and `sync_order_stock` are verified **dropped**; legacy columns `orders.stock_snapshot` and `orders.stock_deducted` are verified **dropped**.                                                                 |

---

## 4. Root Cause Analysis

How did this drift occur?

1. **Timestamp Normalization**: When developing vertical features (add-ons, size guides, hero video fit, etc.), migrations were initially applied to production using timestamps generated at apply-time (e.g. `20260914150814`). Subsequently, local migration filenames were standardized into clean increments (e.g. `20260919100000_brand_addons_platform.sql`).
2. **Direct Hotfix / Out-of-band Execution**: The inventory ledger architecture and order contact snapshot fixes were applied directly to the database without running through the Supabase CLI migration tracker (`supabase migration up`), leaving the schema updated but `schema_migrations` unnotified.

---

## 5. Proposed Reconciliation Plan

We have two options to achieve a zero-drift state (`supabase migration list --linked` showing 100% Synced, 0 Local-only, 0 Remote-only, and `npm run db:migrations:drift` passing):

### Option A: Ledger Repair (Recommended)

Use the official Supabase CLI `migration repair` command to align the remote database ledger with the repository's canonical filenames:

1. Mark the 23 legacy remote versions as reverted/removed from the ledger:
   ```bash
   npx supabase migration repair --status reverted <remote_version>
   ```
2. Mark all 32 canonical local migration versions as applied in the ledger:
   ```bash
   npx supabase migration repair --status applied <local_version>
   ```

- **Pros**:
  - Zero modification to local migration files or git history.
  - Matches the established, clean timestamps in `supabase/migrations/`.
  - Purely modifies `supabase_migrations.schema_migrations` (no DDL touches user tables).
  - Cleanest architectural state for ongoing automated CI checks.
- **Cons**: Requires executing ledger update commands on the linked remote database.

### Option B: Local Filename Alignment + Partial Ledger Repair

Rename the 23 local migration files to match the 23 remote timestamps, and apply ledger repair (`--status applied`) only for the remaining 9 unrecorded migrations.

- **Pros**: Fewer repair operations on the remote database.
- **Cons**: Churn in git repository filenames; mixes clean timestamps with random generation timestamps; disrupts established import references or documentation referring to migration names like `20260925100000_storefront_v2.sql`.

---

## 6. Exact Command Sequence for Option A

When approved by the repository owner, the following idempotent script will reconcile the ledger:

```sql
-- Transactional Ledger Re-alignment in supabase_migrations.schema_migrations
BEGIN;

-- 1. Remove the 23 legacy entries that used non-canonical timestamps
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260909132241', '20260910093402', '20260910093532', '20260910093649',
  '20260912082249', '20260913135522', '20260913135535', '20260914064846',
  '20260914150454', '20260914150633', '20260914150725', '20260914150743',
  '20260914150814', '20260914150855', '20260915052301', '20260917092827',
  '20260917182820', '20260918075330', '20260918080745', '20260920162143',
  '20260920162255', '20260923103823', '20260923105850'
);

-- 2. Insert all 32 canonical local versions into schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260909163000', 'add_footer_logo_size'),
  ('20260910130000', 'security_hardening_rls_and_permissions'),
  ('20260910133000', 'performance_covering_indexes'),
  ('20260910140000', 'optimize_rls_initplan'),
  ('20260912120000', 'remediate_audit_security_and_rls'),
  ('20260913100000', 'storefront_mode_catalog'),
  ('20260913120000', 'catalog_inquiry_tracking'),
  ('20260914100000', 'fix_engagement_views_and_inquiries_consistency'),
  ('20260915100000', 'store_vertical_and_modules'),
  ('20260916100000', 'size_guides'),
  ('20260917100000', 'products_made_to_order_flag'),
  ('20260918100000', 'fit_profiles_config'),
  ('20260918170000', 'fix_order_contact_snapshot_checkout_email'),
  ('20260919100000', 'brand_addons_platform'),
  ('20260920100000', 'addon_store_and_policies'),
  ('20260921100000', 'brand_public_addons_view'),
  ('20260922100000', 'add_coffee_vertical'),
  ('20260922120000', 'export_runs_audit'),
  ('20260922130000', 'merchant_grant_applications'),
  ('20260922140000', 'invoice_customization_enhancements'),
  ('20260923100000', 'profiles_must_change_password'),
  ('20260924100000', 'brand_wizard_provisioning'),
  ('20260925100000', 'storefront_v2'),
  ('20260925110000', 'drop_duplicate_order_delete_trigger'),
  ('20260925113000', 'fix_return_and_cart_stock_columns'),
  ('20260926100000', 'inventory_movements_and_allocations'),
  ('20260926110000', 'inventory_ledger_functions'),
  ('20260926120000', 'order_inventory_state_machine'),
  ('20260926130000', 'inventory_reconciliation_job'),
  ('20260927100000', 'cleanup_legacy_inventory_artifacts'),
  ('20260928120000', 'storefront_hero_and_gallery_display_options'),
  ('20260928140000', 'hero_video_fit')
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

---

## 7. Post-Execution Verification Gates

Immediately following execution of the reconciliation SQL or repair commands:

1. `npx supabase migration list` MUST report:
   - `Synced`: **260**
   - `Local only`: **0**
   - `Remote only`: **0**
2. `npm run db:migrations:drift` MUST output exit code 0 (`PASS`).
3. `npm run db:migrations:check` MUST output exit code 0 (`PASS`).
4. `npm run test` MUST continue passing (all 1,090+ tests green).

---

## 8. Explicit Approval Checkpoint

> [!CAUTION]
> **STOP. Do not execute any write, migration repair, db push, or ledger update until the repository owner grants explicit approval.**
