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
`tests/inventory-history-actor.test.tsx` (rendered sheet, data layer mocked).

## Classification

- **convert** (43): feature assertions on source text.
- **migration** (16): assertions on SQL in
  `supabase/migrations`. They pin database contracts and stay until the
  project has a database test harness (pgTAP or a local Supabase in CI).
- **guard** (10): architecture rules where reading source is
  the point. Keep.

| Group     | Test file                                           | Note                                                     |
| --------- | --------------------------------------------------- | -------------------------------------------------------- |
| convert   | `tests/admin-feedback-states.test.ts`               |                                                          |
| convert   | `tests/annual-subscription-regressions.test.ts`     | source part to convert; SQL part is a migration contract |
| convert   | `tests/brand-owner-provisioning.test.ts`            | source part to convert; SQL part is a migration contract |
| convert   | `tests/brand-r2-cleanup-recovery.test.ts`           | source part to convert; SQL part is a migration contract |
| convert   | `tests/catalog-inquiries.test.ts`                   |                                                          |
| convert   | `tests/customers-inventory-bulk-selection.test.ts`  |                                                          |
| convert   | `tests/hero-media-resolve.test.ts`                  |                                                          |
| convert   | `tests/hero-smart-fit.test.ts`                      |                                                          |
| convert   | `tests/homepage-editorial-sections.test.ts`         | source part to convert; SQL part is a migration contract |
| convert   | `tests/image-crop-system.test.ts`                   |                                                          |
| convert   | `tests/impersonation-exit-regression.test.ts`       |                                                          |
| convert   | `tests/impersonation-lifecycle-regression.test.ts`  |                                                          |
| convert   | `tests/incubator-inline-code-edit.test.ts`          |                                                          |
| convert   | `tests/incubator-page-management.test.ts`           |                                                          |
| convert   | `tests/incubator-reporting-packaging.test.ts`       | source part to convert; SQL part is a migration contract |
| convert   | `tests/launch-security-regressions.test.ts`         | source part to convert; SQL part is a migration contract |
| convert   | `tests/manual-order-draft-regression.test.ts`       |                                                          |
| convert   | `tests/manual-order-tailoring-specs.test.ts`        |                                                          |
| convert   | `tests/onboarding-plan-catalog.test.ts`             | source part to convert; SQL part is a migration contract |
| convert   | `tests/order-change-confirmations.test.ts`          |                                                          |
| convert   | `tests/order-review-reward.test.ts`                 | source part to convert; SQL part is a migration contract |
| convert   | `tests/order-safe-view-mode.test.ts`                |                                                          |
| convert   | `tests/orders-bulk-payment-courier.test.ts`         |                                                          |
| convert   | `tests/orders-fulfillment-method-filter.test.tsx`   |                                                          |
| convert   | `tests/products-made-to-order.test.ts`              | source part to convert; SQL part is a migration contract |
| convert   | `tests/review-management-dashboard.test.ts`         | source part to convert; SQL part is a migration contract |
| convert   | `tests/review-story-generator.test.ts`              |                                                          |
| convert   | `tests/secondary-banner-parallax.test.ts`           | source part to convert; SQL part is a migration contract |
| convert   | `tests/settings-tabs.test.ts`                       |                                                          |
| convert   | `tests/size-guide-templates.test.ts`                |                                                          |
| convert   | `tests/store-profile.test.ts`                       |                                                          |
| convert   | `tests/storefront-catalog-mode.test.ts`             | source part to convert; SQL part is a migration contract |
| convert   | `tests/storefront-e2e-regressions.test.ts`          |                                                          |
| convert   | `tests/storefront-engine-scoping.test.ts`           |                                                          |
| convert   | `tests/storefront-fit-passport.test.ts`             | source part to convert; SQL part is a migration contract |
| convert   | `tests/storefront-google-oauth-return.test.ts`      |                                                          |
| convert   | `tests/storefront-hero-and-gallery-options.test.ts` |                                                          |
| convert   | `tests/storefront-quality-upgrades.test.ts`         |                                                          |
| convert   | `tests/storefront-tailoring-experience.test.ts`     |                                                          |
| convert   | `tests/subscription-renewal-decision.test.ts`       | source part to convert; SQL part is a migration contract |
| convert   | `tests/super-admin-platform-navigation.test.ts`     |                                                          |
| convert   | `tests/typography-management.test.ts`               | source part to convert; SQL part is a migration contract |
| convert   | `tests/variant-axes.test.ts`                        |                                                          |
| migration | `tests/accounting-brand-isolation.test.ts`          | SQL contract                                             |
| migration | `tests/auth-user-deletion-lifecycle.test.ts`        | SQL contract                                             |
| migration | `tests/card-stock-policy-migration.test.ts`         | SQL contract                                             |
| migration | `tests/category-counts-and-rpc-security.test.ts`    | SQL contract                                             |
| migration | `tests/custom-tailoring-location.test.ts`           | SQL contract                                             |
| migration | `tests/fit-passport.test.ts`                        | SQL contract                                             |
| migration | `tests/incubator-consignment.test.ts`               | SQL contract                                             |
| migration | `tests/incubator-item-edit-sync.test.ts`            | SQL contract                                             |
| migration | `tests/incubator-price-sync.test.ts`                | SQL contract                                             |
| migration | `tests/inventory-ledger.test.ts`                    | SQL contract                                             |
| migration | `tests/pura-growth-tools.test.ts`                   | SQL contract                                             |
| migration | `tests/reporting-dashboard-consistency.test.ts`     | SQL contract                                             |
| migration | `tests/returning-customer-promo.test.ts`            | SQL contract                                             |
| migration | `tests/returns-and-exchanges.test.ts`               | SQL contract                                             |
| migration | `tests/stored-routine-repair-migration.test.ts`     | SQL contract                                             |
| migration | `tests/tenant-activation-regression.test.ts`        | SQL contract                                             |
| guard     | `tests/addon-contributions-consumed.test.ts`        | every addon contribution is mounted                      |
| guard     | `tests/arabic-gender-neutral-copy.test.ts`          | copy style across the app                                |
| guard     | `tests/csp-and-manifest.test.ts`                    | CSP and web manifest                                     |
| guard     | `tests/design-system-guardrails.test.ts`            | semantic tokens only                                     |
| guard     | `tests/maintainability-ratchet.test.ts`             | debt ceilings                                            |
| guard     | `tests/mobile-admin-typography.test.ts`             | mobile app typography config                             |
| guard     | `tests/query-keys-integrity.test.ts`                | query-key factory shape                                  |
| guard     | `tests/settings-registry-parity.test.ts`            | registry vs schema parity                                |
| guard     | `tests/storefront-performance-guardrails.test.ts`   | storefront bundle and loading rules                      |
| guard     | `tests/vanilla-core-guard.test.ts`                  | core never imports addons                                |
