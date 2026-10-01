# Behaviour tests (Phase 6)

Tests that read files with `readFileSync` break on harmless edits (a renamed
variable, a moved component) and miss real regressions (the text is there but
the behaviour is wrong). Phase 6 converts the ones that pin **feature
behaviour** to tests that run the code: call the pure function, or render the
component with its data layer mocked. The network is blocked in unit tests
(`tests/setup.ts`), so a missed mock fails instead of reaching production.

## Method

1. Find the rule the test pins (a label, a condition, a fallback).
2. If it lives inside a component, extract it into a pure function in
   `src/lib/` (or the feature's `lib/`) and use it there. Test the function.
3. If what matters is what the user sees, render the component
   (`@testing-library/react`), mocking `@tanstack/react-router` and the data
   layer (`vi.mock` with both the relative and the `@/` path).
4. Check the new test fails on the old code where the old test caught a bug.
5. Delete the source read; lower `readFileSyncTestFiles` in the ratchet.

Examples: `tests/order-profit-clarity.test.ts` (extracted label),
`tests/active-brand-shell-label.test.ts` (extracted workspace rules),
`tests/os-breadcrumb-regression.test.tsx` (extracted builder + rendered menu),
`tests/inventory-history-actor.test.tsx` (rendered sheet, data layer mocked),
`tests/review-story-generator.test.ts` (canvas renderer with a recording fake context),
`tests/order-change-confirmations.test.tsx` (modal and Radix menu driven by events),
`tests/storefront-google-oauth-return.test.ts` (a route's real `beforeLoad` guard),
`tests/hero-smart-fit.test.ts` (rendered hero and shell, context mocked).

## Real SQL in tests

A database function whose logic matters (the booking engine) is tested by
running it, not by reading it: `tests/helpers/booking-engine-db.ts` starts an
in-process Postgres (PGlite, a dev dependency), builds a small fixture schema,
applies the migration (imported with `?raw`, so no `readFileSync`) and
exercises the functions as the anon, authenticated and service roles. CI's
migration job still applies every migration to Postgres 15.

## Classification

- **convert** (0): feature assertions on source text. All converted (2026-09-27).
- **migration** (34): assertions on SQL in
  `supabase/migrations` (and two Deno edge functions). They pin database
  contracts and stay until the project has a database test harness (pgTAP
  or a local Supabase in CI) and an edge-function runner.
- **guard** (10): architecture rules where reading source is
  the point. Keep.

| Group     | Test file                                         | Note                                |
| --------- | ------------------------------------------------- | ----------------------------------- |
| migration | `tests/accounting-brand-isolation.test.ts`        | SQL contract                        |
| migration | `tests/annual-subscription-regressions.test.tsx`  | SQL contract                        |
| migration | `tests/auth-user-deletion-lifecycle.test.ts`      | edge function contract (Deno)       |
| migration | `tests/brand-owner-provisioning.test.tsx`         | edge function contract (Deno)       |
| migration | `tests/brand-r2-cleanup-recovery.test.tsx`        | SQL contract                        |
| migration | `tests/card-stock-policy-migration.test.ts`       | SQL contract                        |
| migration | `tests/catalog-inquiries.test.ts`                 | SQL contract                        |
| migration | `tests/category-counts-and-rpc-security.test.ts`  | SQL contract                        |
| migration | `tests/custom-tailoring-location.test.ts`         | SQL contract                        |
| migration | `tests/fit-passport.test.ts`                      | SQL contract                        |
| migration | `tests/homepage-editorial-sections.test.tsx`      | SQL contract                        |
| migration | `tests/incubator-consignment.test.ts`             | SQL contract                        |
| migration | `tests/incubator-item-edit-sync.test.ts`          | SQL contract                        |
| migration | `tests/incubator-price-sync.test.ts`              | SQL contract                        |
| migration | `tests/incubator-reporting-packaging.test.ts`     | SQL contract                        |
| migration | `tests/inventory-ledger.test.ts`                  | SQL contract                        |
| migration | `tests/launch-security-regressions.test.ts`       | SQL contract                        |
| migration | `tests/onboarding-plan-catalog.test.tsx`          | SQL contract                        |
| migration | `tests/order-review-reward.test.tsx`              | SQL contract                        |
| migration | `tests/products-made-to-order.test.ts`            | SQL contract                        |
| migration | `tests/pura-growth-tools.test.ts`                 | SQL contract                        |
| migration | `tests/reporting-dashboard-consistency.test.ts`   | SQL contract                        |
| migration | `tests/returning-customer-promo.test.ts`          | SQL contract                        |
| migration | `tests/returns-and-exchanges.test.ts`             | SQL contract                        |
| migration | `tests/review-management-dashboard.test.ts`       | SQL contract                        |
| migration | `tests/secondary-banner-parallax.test.tsx`        | SQL contract                        |
| migration | `tests/size-guide-templates.test.ts`              | SQL contract                        |
| migration | `tests/store-profile.test.ts`                     | SQL contract                        |
| migration | `tests/stored-routine-repair-migration.test.ts`   | SQL contract                        |
| migration | `tests/storefront-catalog-mode.test.ts`           | SQL contract                        |
| migration | `tests/storefront-fit-passport.test.tsx`          | SQL contract                        |
| migration | `tests/subscription-renewal-decision.test.tsx`    | SQL contract                        |
| migration | `tests/tenant-activation-regression.test.ts`      | SQL contract                        |
| migration | `tests/typography-management.test.ts`             | SQL contract                        |
| guard     | `tests/addon-contributions-consumed.test.ts`      | every addon contribution is mounted |
| guard     | `tests/arabic-gender-neutral-copy.test.ts`        | copy style across the app           |
| guard     | `tests/csp-and-manifest.test.ts`                  | CSP and web manifest                |
| guard     | `tests/design-system-guardrails.test.ts`          | semantic tokens only                |
| guard     | `tests/maintainability-ratchet.test.ts`           | debt ceilings                       |
| guard     | `tests/mobile-admin-typography.test.ts`           | mobile app typography config        |
| guard     | `tests/query-keys-integrity.test.ts`              | query-key factory shape             |
| guard     | `tests/settings-registry-parity.test.ts`          | registry vs schema parity           |
| guard     | `tests/storefront-performance-guardrails.test.ts` | storefront bundle and loading rules |
| guard     | `tests/vanilla-core-guard.test.ts`                | core never imports addons           |
