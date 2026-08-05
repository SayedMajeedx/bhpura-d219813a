# Release quality, security, and production-readiness audit

Date: 2026-08-05

Scope: read-only review of routes, automated coverage, authorization boundaries, Tap payment integration, environment/configuration, CI, production build output, dependency audit, and a cold-load performance trace of the public authentication page. No live data was mutated.

## Release recommendation

**CONDITIONAL GO after the P0 fixes below are deployed and verified in the test environment.** Both P0s are patched, focused regressions pass, and the local engineering gate is green; deployed endpoint and payment-sandbox verification remain mandatory.

## P0 findings

### 1. Unauthenticated service-role order mutation (patched; deployment verification required)

- Affected route: `PATCH /api/orders/status` (`src/routes/api.orders.status.ts`).
- Original behavior: the public server route accepted an arbitrary order UUID plus `payment_status`, `fulfillment_status`, `status`, `assigned_to`, `delivery_notes`, and a client-controlled `admin_override`; it then updated through `supabaseAdmin`, bypassing RLS. There was no bearer-token validation, role/permission check, or tenant/brand authorization.
- Exploitability: anyone who could obtain or guess an order UUID could alter payment/fulfillment state, assignment, or notes. `admin_override: true` bypassed the unpaid-prepaid guard. The route is confirmed in the generated route tree as `/api/orders/status`.
- Patch reviewed: requires a valid bearer token, active profile, `manage_orders`-equivalent access, brand match (except super-admin), restricts courier fields, restricts override to admins, and scopes the update to the fetched brand.
- Regression coverage added: missing bearer token returns 401 before DB access; missing/inactive profile returns 403 before the order is fetched; cross-brand admins are rejected; assigned couriers cannot change privileged payment/assignment fields.
- Required deployed verification: unauthenticated request => 401; invalid token => 401; inactive user => 403; cross-brand admin => 403; unassigned courier => 403; assigned courier cannot change payment/assignment/override; authorized same-brand admin succeeds.

### 2. Tap redirect did not bind the verified charge to the supplied order (patched; deployment verification required)

- Affected route: `GET /api/public/payments/tap-redirect` (`src/routes/api.public.payments.tap-redirect.ts`).
- Original behavior: the route fetched a real Tap charge using the brand credential, but trusted caller-controlled `order_id` and `brand_id`. It did not compare the charge metadata to those values or compare the order's stored gateway reference to `tap_id`.
- Exploitability: a captured charge from the same brand could mark a different order paid; a non-success charge could delete a different pending order. This is payment-integrity and destructive cross-order impact.
- Patch reviewed: rejects metadata mismatch and rejects a missing/mismatched stored payment reference before either update or deletion.
- Regression coverage added: a captured charge whose verified metadata names another order returns 400 and does not query/mutate the order; a mismatched stored gateway reference is rejected; transient gateway status retains the order; a failed paid-order update cannot redirect as success.
- Required deployed verification: wrong order metadata => 400/no mutation; wrong brand metadata => 400/no mutation; mismatched stored reference => 400/no mutation; replay after paid => idempotent; failed/cancelled redirect never deletes an unrelated or previously paid order.

## Resolved P1 findings

### 3. Tap charge creation idempotency and eligibility (resolved locally)

- The route now accepts only eligible unpaid card/Tap orders, rejects terminal orders, builds the redirect from the request origin, supplies Tap's documented `reference.idempotent` value derived from the brand and checkout idempotency key, safely resumes only a metadata-matched stored charge, and persists the reference with brand scope plus a null compare-and-set.
- Duplicate/retry tests prove the stable Tap idempotency reference and caller-supplied redirect rejection. The Tap sandbox must still verify duplicate concurrent calls return the same charge within Tap's documented 24-hour idempotency window.

### 4. CI dependency-security gate (resolved locally)

- `.github/workflows/ci.yml` now fails on high/critical dependency audit findings instead of forcing a successful job.

### 5. Browser/release coverage is much narrower than the route surface

- Inventory: 61 generated application/API routes, including storefront discovery/product/search/wishlist/account/checkout, extensive brand admin, reporting, integrations, media, cron, and payment endpoints.
- Automated inventory: 10 Vitest files (now 11 with the security regression file) and 5 Playwright specs. Existing browser specs are primarily mocked admin rendering/responsiveness/navigation checks; they do not exercise real tenant isolation, real database state transitions, Tap callbacks, webhook replay, cron authentication, R2 authorization, email outbox retries, or the full storefront order lifecycle.
- Recommendation: maintain a route/role/operation coverage matrix and add deployed test-environment API/integration tests for every privileged handler and critical RPC. Treat UI-only mocks as component coverage, not end-to-end security evidence.

## P2 findings and improvements

### Quality gate is green

- Typecheck, lint, formatting, and the full unit suite pass (`58/58` tests across 11 files on the final local gate). The three hook warnings were fixed with functional state updates or current callback refs, avoiding stale closures without suppressions.

### Public/privileged endpoint backstop

- A final route inventory found five explicit server endpoints: authenticated order-status mutation, Tap charge creation, Tap redirect, Tap webhook, and the receipt-cleanup cron route.
- Source verification found no additional unauthenticated service-role mutation endpoint. The cron route requires `CRON_SECRET`; the order route validates bearer identity, active profile, role/permission, and tenant; payment mutation paths re-fetch the charge from Tap and bind verified metadata/reference to the order.
- This is source-level evidence only. Deployment must still prove secrets, gateway credentials, and runtime route behavior.

### Build succeeds but local secret readiness is not proven

- `npm run build`: exited 0; client and SSR bundles were produced.
- Wrangler warned that 12 required server secrets were absent in this local environment. That is expected for a safe local checkout but means the build alone does not establish deployed secret readiness.
- Required preflight: use the hosting provider's secret inventory (names only, never values) and verify all required secrets, Tap credentials per brand, Supabase service role, webhook/cron secrets, R2 private/public buckets, and email-function secret parity.

### Large lazy chunks deserve targeted journey measurement

- Build output includes large compressed route/dependency chunks: order detail ~155 KB gzip, workbook library ~141 KB, PDF library ~130 KB, chart library ~93 KB, and settings/inventory routes ~56/48 KB gzip. Route splitting is present, which limits storefront impact.
- Recommendation: preserve lazy loading and measure the specific admin journeys before optimizing. Do not remove libraries based on bundle size alone. Consider loading PDF/XLSX/chart code only on the user action/tab that needs it.

### Logging and observability

- Cloudflare observability is enabled at 100% head sampling. Structured cron completion events exist, but much application logging is unstructured and several payment errors return raw upstream/error text.
- Recommendation: redact provider payloads and personal data, return stable public error codes, attach request/order correlation IDs, use structured severity fields, alert on payment verification mismatch/replay and email/WhatsApp retry exhaustion, and revisit 100% sampling for cost/data minimization after launch baselines are known.

## Automated execution evidence

| Check                                                                   | Result                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript (`tsc --noEmit`)                                             | Pass                                                                                                                                                                                 |
| Vitest before patch                                                     | 48/48 pass across 10 files                                                                                                                                                           |
| Focused security regression tests                                       | 10/10 pass                                                                                                                                                                           |
| Final full local gate (`npm run check`)                                 | Pass: typecheck, lint, formatting, and 58/58 tests across 11 files                                                                                                                   |
| Production Vite/SSR build                                               | Pass; secret-readiness warning noted                                                                                                                                                 |
| Formatting/lint release gate                                            | Pass                                                                                                                                                                                 |
| Production dependency audit (`--omit=dev --audit-level=high --offline`) | 0 known vulnerabilities in cached advisory data; online CI scan still required                                                                                                       |
| Playwright                                                              | Local run could not complete reliably: first blocked by Wrangler writing outside the workspace; workspace-local retry did not finish and was terminated. CI/deployed rerun required. |

## Performance snapshot

Target traced: `https://boutq.store/auth`, cold reload, desktop browser, no CPU/network throttling. This is a lab snapshot, not field data, and it does not represent authenticated admin or storefront product/checkout routes.

| Metric | Observed | Rating |
| ------ | -------: | ------ |
| LCP    |   900 ms | Good   |
| CLS    |     0.00 | Good   |
| TTFB   |    22 ms | Good   |

LCP was almost entirely render delay (878 ms), but total LCP remained good. The trace reported render-blocking and cache opportunities with **0 ms estimated FCP/LCP savings**, so they are not release priorities. No CrUX field data was available. Repeat with mobile throttling on the actual storefront home, category, product, cart/checkout, admin dashboard, orders list, and order detail after P0 deployment.

## Minimum launch verification checklist

1. Deploy P0 patches to the test environment and run the negative authorization/payment cases above.
2. Require the full hosted CI workflow to be green.
3. Run the complete Playwright suite against a stable local or deployed test target and retain traces/screenshots for failures.
4. Perform same-brand and cross-brand role tests for super-admin, brand admin, limited staff, courier, customer, and anonymous users.
5. Exercise Tap success, decline, cancel, timeout, duplicate submit, webhook-before-redirect, redirect-before-webhook, replay, and stale-reference scenarios.
6. Confirm deployed secret names/bindings, cron authentication, private R2 access, email outbox retry/dead-letter visibility, backups, rollback steps, and alert ownership.
7. Only move to conditional GO after all P0 cases pass with no unauthorized database mutation and payment/order reconciliation is clean.

## Deployed smoke — version `ff684b56`

Date: 2026-08-05

**Final result after propagation: pass for this limited non-mutating smoke.** These checks used only public GET/HEAD requests and deliberately invalid, unauthenticated API requests. No live records were mutated.

- `GET /auth` returned 200; `GET /` returned the expected 307 redirect to `/admin`.
- Malformed Tap requests failed safely: a redirect without identifiers returned 400, charge creation with an empty body returned 400, and an empty webhook payload returned 400 without gateway/database processing.
- During the first check at 18:54 Bahrain time (15:54 UTC), the edge still served stale assets (`styles-GgAC1IBh.css`, `index-DfzRoarA.js`) and the old order handler returned 400 before authentication. This was a temporary propagation/stale-window result, not the final deployment result.
- The repeated check after confirmed propagation served new assets (`styles-ByiCuaZ9.css`, `index-htsP622n.js`, `storefront-context-jnuycRNH.js`).
- On the propagated deployment, unauthenticated `PATCH /api/orders/status` with valid empty JSON returned the required 401 `Unauthorized`, confirming authentication now runs before body/order processing.
- Malformed Tap requests again failed safely after propagation: redirect, charge creation, and webhook returned 400.
- This clears the earlier deployment-mismatch P0 for the tested boundary. It does not replace authenticated same-brand/cross-brand/courier tests or full payment-sandbox reconciliation.
