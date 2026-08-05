# Storefront release audit

> Coordinator correction: the Arabic search literals were rechecked with UTF-8-aware tooling and are valid. SF-01 below is a shell-decoding false positive and must not be treated as a product defect. Exit criteria apply to SF-02, SF-03, and the live matrix.

Date: 2026-08-05  
Scope: customer-facing storefront only  
Target reviewed: active custom domain `https://boutq.store` (from `wrangler.json`), storefront wildcard routing, source routes, components, and automated tests. The old `workers.dev` deployment URL was also checked only to establish that it is not a valid storefront entry point.

## Live audit status and limitation

The prepared production storefront was verified at `https://pura.boutq.store/pura` in Chrome. The old Worker root returned `Page not found` and is not a storefront entry point. The live audit covered Arabic and English home rendering, mobile/desktop direction and overflow checks, search, product detail, option/stock behavior, cart, checkout, a real disposable pickup/COD order, confirmation, and creation/redirect of a second disposable Tap card order. The admin tab was not claimed or disturbed. Credentials are not reproduced here.

Tap Web Checkout correctly displayed **BD 24.000 / 1 item**. Its cross-origin secure PCI card iframe rejected automated input, so the user completed the official approved test card manually. The payment successfully redirected to the storefront confirmation for order `1f4f3a79-c760-4b5c-9d93-b235377fc161`. A safe refresh retained the same URL/order ID and confirmation without initiating another charge or order. The declined payment outcome remains **untested**. Authentication/account, wishlist persistence, Benefit receipt upload, promo rules, controlled network failures, and other browsers remain untested.

## Release assessment

**Conditional no-go for the storefront until P1 items are fixed or explicitly accepted and the critical live matrix below is executed.** Live Arabic search rendering passed. Checkout form/validation remains inconsistent, and the repository has no customer storefront end-to-end suite covering browse-to-order or payment. Existing Playwright coverage is concentrated on admin screens.

## Verified findings

### SF-01 — Closed / false positive — Arabic search text

Live production disproved the terminal-encoding-based suspicion. At `https://pura.boutq.store/pura/search?q=Dress`, Arabic rendered correctly as `نتائج البحث`, `عن "Dress"`, `الأحدث`, `السعر: الأقل أولاً`, and `السعر: الأعلى أولاً`. No mojibake was visible. No product fix is required for this item.

### SF-02 — P1 — Checkout presents email as optional but blocks every order without it

- Evidence: `src/routes/$slug.checkout.tsx` labels Email without an asterisk, while the input has `required`; `submit()` always rejects an empty email through its email regex. The initial validation message says only “Name and phone are required.”
- Reproduction: add an item, open `/{slug}/checkout`, fill all visibly required delivery fields but leave Email blank, then place the order.
- Expected: either email is clearly marked required everywhere, or guest checkout can proceed without it where order updates can use phone/WhatsApp.
- Actual (source-verified): submission is rejected for missing email even though the visual required indicator and first validation summary omit it.
- Impact: checkout abandonment and confusing validation, especially for phone-first customers.
- Recommendation: make the business rule explicit. If required, add the marker and include email in the validation summary; if optional, validate only when non-empty and ensure confirmation handling supports the absence of email.

### SF-03 — P1 — No automated storefront purchase/payment journey exists

- Evidence: the route inventory includes home, category, search, product, wishlist, checkout, auth, account, thank-you, and Tap endpoints. Test inventory contains admin Playwright audits plus unit/security tests, but no browser test exercises a storefront browse → variant → cart → checkout → payment/confirmation journey.
- Impact: release-critical regressions in cart persistence, customer identity, stock races, promo calculation, Tap redirects/webhooks, and confirmation routing can ship undetected.
- Recommendation: add at least four release-gate Playwright journeys: guest COD/other non-card success, authenticated account order, Tap test-mode success/failure/refresh, and insufficient-stock/duplicate-submit behavior. Run English desktop plus Arabic mobile for each critical branch.

### SF-04 — P2 — Search sorting mutates cached query data in place

- Evidence: `src/routes/$slug.search.tsx` assigns `const rows = data ?? []` and calls `rows.sort(...)`. `data` is React Query-managed cache data.
- Reproduction: search, switch between price ordering and Newest, then revisit or otherwise consume the same cached search query.
- Expected: each sort derives a new ordered array without changing cached server-order data.
- Actual (source-verified): price sorting mutates the cached array, so switching back to Newest cannot reliably restore original order without a refetch.
- Recommendation: use `const rows = [...(data ?? [])]` before sorting; add a test that toggles low → high → newest and verifies stable expected ordering.

### SF-05 — P2 — Cart quantity can retain one unit when current shared availability is zero

- Evidence: `updateQty()` in `src/lib/storefront-context.tsx` computes `availableForLine` with `Math.max(1, target.max_stock - usedByOthers)`. If another configuration of the same variant consumes all available stock, the target line is still clamped to at least one.
- Reproduction: create two cart lines that resolve to the same variant but differ in custom-field configuration and allocate the full `max_stock` to one; update the other line.
- Expected: total quantity across lines never exceeds variant availability, or the conflicting line is removed/blocked with a clear message.
- Actual (source-verified): the update path permits a minimum of one even when computed availability is zero. The server may reject later, but the cart presents an invalid state.
- Recommendation: clamp at zero and remove or flag the line; revalidate stock when opening checkout and immediately before RPC submission.

### SF-06 — P2 — Zero-stock selected variant leaves purchase buttons enabled

- Evidence: live mobile product page `https://pura.boutq.store/pura/product/e113bea0-0247-4de5-ab19-06b1118ef76a`, English, selected size 52. The page displayed `0 available`; both `Add to cart` and `Buy now` were enabled. Clicking Add to cart produced `This option is out of stock` and did not add it.
- Impact: avoidable dead-end interaction and accessibility ambiguity; users are invited to perform an action that is known to fail.
- Recommendation: disable both purchase controls for a zero-stock selection, expose `aria-disabled`, and put the out-of-stock explanation adjacent to the controls. Automatically selecting the first available variant would further reduce friction.

### SF-07 — P2 — Confirmation navigation briefly renders the checkout empty-cart state

- Evidence: after placing the disposable pickup/COD order, the URL changed to `/pura/thank-you/42fe079e-3704-4332-afd6-a0383739b4a1?...` and the success toast appeared, but the first post-navigation DOM showed `Your cart is empty / Back to store`. Approximately 1.2 seconds later it replaced this with the correct `Thank you for your order!` confirmation.
- Impact: on slower devices customers may believe confirmation failed or be tempted to retry, despite the order already existing.
- Recommendation: preserve a route-level transition/loading state until the thank-you route is committed; never reuse the checkout empty-cart panel after order submission.

### SF-08 — P2 — Checkout email required state is visually inconsistent (live confirmed)

- Evidence: English mobile checkout showed `Full name *`, `Phone *`, but only `Email` without an asterisk. The underlying input is required and submit validation always rejects an empty/invalid email (see SF-02).
- Recommendation: align label, required semantics, validation summary, and product policy.

### SF-09 — P2 — Successful payment confirmation logs a React hydration mismatch

- Evidence: the successful Tap redirect and a subsequent clean refresh both rendered the correct thank-you page but logged production `Minified React error #418` from `assets/index-DfzRoarA.js`. React error 418 indicates server/client hydration content did not match.
- URL: `/pura/thank-you/1f4f3a79-c760-4b5c-9d93-b235377fc161?payment=success&fulfillment=delivery&channel=email`.
- Impact: React must recover by client-rendering mismatched content. This can cause transient visual replacement, lost server-rendering benefits, and inconsistent behavior on slower devices; it is consistent with the transient route-content flash observed in SF-07.
- Recommendation: reproduce in a development build for the full component stack, compare server and first-client output for storefront language/session-dependent header text and thank-you content, and ensure browser-only state is deferred until after hydration.

### SF-10 — P1 — Tap success confirmation displays the wrong fulfillment method

- Evidence: admin order #1085 / order ID `1f4f3a79-c760-4b5c-9d93-b235377fc161` is pickup at Boutique Noor — Sitra, matching the pickup selection observed during checkout. The preserved success URL is `/pura/thank-you/1f4f3a79-c760-4b5c-9d93-b235377fc161?payment=success&fulfillment=delivery&channel=email`, and the page visibly says `We received your order and will contact you shortly to confirm delivery.`
- Root cause: `src/routes/api.public.payments.tap-redirect.ts` redirects successful charges to `/${brandSlug}/thank-you/${orderId}?payment=success`, omitting fulfillment/channel. `src/routes/$slug.thank-you.$orderId.tsx` defaults every missing or unrecognized fulfillment value to `delivery`.
- Scope: every successful Tap pickup order can show delivery wording; successful digital orders can also lose their delivery channel and show delivery wording. The stored order/admin data remains correct in this observed case.
- Impact: customers receive contradictory instructions immediately after payment and may expect delivery rather than branch pickup. This is a pre-launch customer-service and fulfillment risk.
- Recommendation: do not trust client query parameters for fulfillment copy. In the verified redirect handler, fetch the order's persisted `fulfillment_method` (and digital channel/contact metadata where applicable) and include validated values in the redirect, or have the thank-you route securely load the order's persisted fulfillment details. Add Tap success tests for delivery, pickup, and digital.

## Coverage inventory

Routes found:

- Store home and category/smart-category browsing
- Search and sort
- Product detail, variants, custom fields, related products
- Wishlist and empty state
- Cart drawer and quantity controls
- Checkout: delivery, pickup, digital; promo; manual Benefit receipt; card/Tap
- Store-scoped authentication and confirmation
- Account profile, addresses, order history/status
- Thank-you page and public invoice path

## Completed live journey evidence

- Arabic desktop home: RTL (`html lang=ar`, `dir=rtl`), measured client width 1382 and scroll width 1382; no horizontal overflow. Evidence: `docs/release/evidence/storefront-ar-desktop.png`.
- Arabic mobile home: viewport override requested at 390×844; Chrome content viewport measured 355×767, client/scroll width 341/341; no horizontal overflow. Evidence: `docs/release/evidence/storefront-ar-mobile.png`.
- English mobile home: `html lang=en`, `dir=ltr`, client/scroll width 341/341; no horizontal overflow. Evidence: `docs/release/evidence/storefront-en-mobile.png`.
- Search: `Dress` navigated to `/pura/search?q=Dress`, returned one product, and English/Arabic labels were correct.
- Product/cart: Dress PR3 size 52/Black, one available, added successfully; cart showed the correct selection and total BHD 13.000.
- Checkout: mobile layout had no horizontal overflow. Both the in-flow and sticky `Place order` buttons were present; the sticky control was visible within the viewport. Evidence: `docs/release/evidence/storefront-checkout-en-mobile.png`.
- Disposable pickup/COD order: successfully created, order ID `42fe079e-3704-4332-afd6-a0383739b4a1`; cart cleared and correct pickup confirmation eventually rendered. Evidence: `docs/release/evidence/storefront-order-confirmation-mobile.png`.
- Tap redirect: second disposable order created from Abaya Code PR2, size 54, BHD 24.000. Tap Web Checkout displayed merchant `boutq`, BD 24.000, and 1 item. Evidence: `docs/release/evidence/tap-checkout-zero-amount.png` (captured during initial loading) and `docs/release/evidence/tap-card-entry-blocker.png` (settled correct amount/card form).
- Tap approved test success: user completed the secure card frame manually. Redirected to order `1f4f3a79-c760-4b5c-9d93-b235377fc161` with `payment=success`; a delivery thank-you message rendered, but it was incorrect for the stored pickup order (SF-10). Refresh was idempotent at the confirmation-page level: identical URL/order ID and content, with no new charge/order action. Evidence: `docs/release/evidence/tap-payment-success-confirmation.png`.
- Fulfillment reconciliation: admin identified the same order as pickup at Boutique Noor — Sitra, while the Tap success page displayed delivery. This is the verified SF-10 redirect/defaulting defect; the confirmation copy was not correct for the stored order.
- Console: the Tap success confirmation logged React error 418 both initially and after refresh (SF-09). The connected Browser API exposed console logs but did not expose a network-request log, so network errors could not be independently enumerated.
- Official Tap reference used: `https://developers.tap.company/reference/testing-cards`.

## Required live test matrix before launch

Remaining live cases that must be completed:

1. English/LTR and Arabic/RTL at 390×844, 768×1024, 1366×768, and 1920×1080: header, menus, hero, cards, dialogs, drawers, forms, sticky checkout controls, footer; check clipping, horizontal overflow, alignment, focus order, and 44 px touch targets.
2. Search: empty term, no results, Arabic/English product names, special characters, sort toggling, keyboard submission, and invalid/unknown category.
3. Product: every option dimension, unavailable combinations, zero stock, quantity ceiling, required custom fields, image/video gallery, wishlist persistence, direct/legacy URL canonicalization.
4. Cart: two configurations of one variant, add beyond stock, refresh persistence, removal/empty state, language switch, stale inventory, double-click checkout.
5. Checkout: guest and authenticated; delivery/pickup/digital; all address validation; account-conflict popup; promo valid/invalid/expired/sale-exclusion; receipt missing/invalid; disabled payment methods; double submit; network/RPC failure; stock race.
6. Tap test mode: approved success and confirmation refresh passed. Still test decline, authentication failure, browser back, duplicate callback/webhook, mismatched metadata, payment success with delayed webhook, and admin/account payment-status consistency. Use only current official Tap test-card documentation.
7. Account/auth: register, sign in/out, wrong password, store membership boundary, OAuth confirmation, redirect preservation, profile/address edits, empty/history states, cancellation/refund display.
8. Accessibility and visual regression: keyboard-only flow, visible focus, semantic labels, contrast, zoom to 200%, screen-reader names, reduced motion, broken/slow images, and long Arabic/English content.

## Enhancement recommendations

- Add screenshot baselines for the four viewports in both languages, prioritizing header/navigation, product detail, cart, checkout, account, and empty/error states.
- Add a persistent checkout step summary and inline field-level validation; move focus to the first invalid field.
- Display a stock-changed recovery panel that updates/removes affected cart lines instead of a generic toast after submission.
- Instrument funnel events with consent respected: search, product view, add/remove cart, checkout start, validation failure category, payment redirect, payment success/failure, and order confirmation.
- Add synthetic post-deploy smoke tests against the active custom storefront domain using disposable brand/customer data and Tap test mode.

## Exit criteria

- SF-02, SF-03, and SF-10 resolved or explicitly accepted by the release owner; SF-01 is closed as a false positive.
- Critical live matrix passes with evidence for English desktop and Arabic mobile at minimum.
- The successful Tap redirect/confirmation passed. Before launch, complete one failed Tap test-mode transaction and reconcile both outcomes across webhook/redirect, admin order, account history, and confirmation.
- No horizontal overflow, clipped controls, unreadable text, or blocking console/network errors on critical routes.

## Post-deploy regression attempt — reported build `ff684b56…`

Status: **blocked by stale production assets; fixes cannot yet be certified on the custom domain.** No order, charge, customer, or other mutation was created during this pass.

- A hard refresh and cache-busted navigation (`?build=ff684b56`) on `pura.boutq.store` continued to load `https://pura.boutq.store/assets/index-DfzRoarA.js` and `styles-GgAC1IBh.css`. No build marker was present in the HTML. This is the same JavaScript asset observed before the reported deployment.
- React error 418 still reproduced on a cold/cache-busted thank-you load from `index-DfzRoarA.js`.
- Zero-stock size 52 still displayed `0 available` while both Add to cart and Buy now remained enabled.
- Search sorting still reproduced SF-04: Newest began `[Dress PR3, Abaya, Abaya Code PR2]`; after selecting high-to-low and then Newest, the order remained `[Abaya Code PR2, Abaya, Dress PR3]` instead of restoring the initial order.
- A cache-busted pickup query safely showed the correct pickup wording, but this does not verify SF-10 because the actual Tap redirect handler was not invoked and the old success URL still carried `fulfillment=delivery`.
- The direct Worker URL `/pura?build=ff684b56` returned `Page not found`, so it could not be used as an alternate verification target.
- Email marker, checkout transition, persisted fulfillment redirect, and Tap decline were not retested once the stale build was established. Per coordinator instruction, all mutation/payment work stopped.

Required next action: confirm the custom-domain route is serving build `ff684b56…` (or provide the new hashed JS asset/deployment URL), then rerun the read-only fixes first. Only after the correct build is confirmed should a disposable Tap decline order be authorized and created.

## Propagated-build retest — `index-htsP622n.js`

The active custom domain subsequently served `https://pura.boutq.store/assets/index-htsP622n.js`. Targeted regression results:

- **SF-09 hydration: passed.** Cache-busted home and thank-you loads logged no React #418 and no warning/error entries in the available browser console log.
- **SF-06 zero-stock controls: passed.** Abaya Code PR2, size 52 displayed `0 available`; Add to cart and Buy now were both disabled.
- **SF-04 search sorting: passed.** Search `q=a` started `[Dress PR3, Abaya, Abaya Code PR2]`, changed correctly for high-to-low, and returned to the identical initial order when Newest was reselected.
- **SF-02/SF-08 email marker: passed.** Checkout now visibly and semantically presents `Email *`, aligned with its required validation.
- **SF-10 presentation primitive: partial pass.** A cache-busted known-order thank-you URL with `fulfillment=pickup` showed the correct pickup wording and no hydration error. A URL without fulfillment still canonicalized/defaulted to `fulfillment=delivery`; therefore the persisted-order fallback is not independently verified. The actual Tap redirect must supply the stored method, and no new successful charge was created during this pass to exercise it end to end.
- **SF-07 transition flash: not retested.** It requires a completed order transition. The permitted decline attempt never left checkout.

### Tap decline attempt blocked before secure card entry

Exactly one permitted disposable decline-order attempt was submitted: pickup at Boutique Noor — Sitra, Abaya size 52, BHD 23.000. Checkout did not reach Tap Web Checkout. Charge creation returned Tap error code `1202`, `Duplicate Request. Please try again later`, reference `TS06A0520261601Nk8r0508739`. No card details were entered and no second order/charge was attempted. Evidence: `docs/release/evidence/postdeploy-tap-duplicate-error.png`.

Because the storefront creates the order before requesting the Tap charge, the corresponding unpaid/pending disposable order may exist even though the gateway page was never reached. Confirm and cancel/delete it from admin before any retry. Investigate whether the Tap idempotency key or merchant transaction reference is being reused across distinct orders; a unique order ID should normally prevent unrelated requests being classified as duplicates.

## Tap idempotency-fix verification — Cloudflare version `7af1c858-92b8-482c-ac77-cdb1e6b8f473`

After propagation, exactly one fresh controlled pickup/card order was submitted: Boutique Noor — Sitra, Abaya size 52, BHD 23.000. The prior Tap 1202 duplicate error did **not** recur. The storefront redirected successfully to Tap Web Checkout, which displayed merchant `boutq`, `BD 23.000`, `1 ITEM`, and the secure Card number / MM/YY / CVV form.

No card data was entered by automation and the Place order action was not retried. The Tap tab was preserved for manual entry of the official declined test combination. Evidence: `docs/release/evidence/tap-decline-form-idempotency-fixed.png`.

Result: **idempotency fix passed through charge creation and gateway redirect.** Decline handling remains pending until the user completes the secure Tap form and the storefront redirect is inspected.

### Manual Tap decline result

After the user submitted the official declined test combination, the preserved tab returned from Tap sandbox to `https://pura.boutq.store/pura/checkout`. By the time the tab was claimed, the app had removed the failure query parameters via `history.replaceState`, and no toast remained. `document.referrer` was `https://acceptance.sandbox.tap.company/`, confirming the return from Tap.

- No success/thank-you page was shown.
- The cart was preserved: Abaya × 1, size 52.
- The checkout form was reset: customer fields blank, fulfillment back to Delivery, and no payment method selected.
- No browser console warnings/errors were present.
- A safe refresh retained the same plain checkout URL and cart, produced no console errors, and did not initiate another order or charge.
- The cleaned redirect URL/order ID and backend order/charge status could not be recovered storefront-side. A single focused browser-history lookup was attempted to recover the transient query, but the browser request stalled and was aborted without result.

Assessment: the customer is returned safely to checkout with their cart intact, and refresh is idempotent. However, failure feedback is ephemeral: once the toast disappears and query is cleaned, there is no persistent declined-payment explanation or reconciliation reference. Verify the corresponding order remains unpaid/pending (not paid/confirmed) in admin, and consider a persistent inline payment-failure banner with a support/reference ID.

## Final-deploy read-only storefront smoke

Target asset: `https://pura.boutq.store/assets/index-TuptQg8A.js`.

- English desktop home (1366×768 override): `lang=en`, `dir=ltr`, client/scroll width 1228/1228, no horizontal overflow, correct title; no console warnings/errors.
- Arabic desktop home: `lang=ar`, `dir=rtl`, Arabic `بيورا لاين` heading, client/scroll width 1228/1228; no console warnings/errors.
- Arabic mobile home (390×844 override; Chrome content viewport 355 px wide): client/scroll width 341/341, no horizontal overflow.
- Arabic mobile product: localized title/description/stock labels rendered; known zero-stock PR2 size 52 kept Add/Buy disabled; no console warnings/errors.
- Arabic mobile cart: existing local test cart rendered the Abaya line, size, price, quantity controls, delete action, total, and checkout action; client/scroll width 355/355.
- Arabic mobile checkout: customer, fulfillment, address, payment, and summary sections rendered; required Email marker present; client/scroll width 355/355 with no horizontal overflow; no console warnings/errors.
- English desktop checkout: LTR sections and required markers rendered, client/scroll width 1228/1228 with no horizontal overflow; no console warnings/errors.
- No order, payment, customer, or server-side data mutation was performed.

Malformed payment endpoint smoke was constrained by the browser surface. In-page `fetch` is unavailable in the read-only evaluation sandbox, and a new-tab GET to the parameterless Tap redirect endpoint was blocked locally with `ERR_BLOCKED_BY_CLIENT` before reaching the server. The POST charge endpoint was not invoked because navigation cannot safely issue the required malformed JSON POST. Source inspection confirms both handlers validate missing identifiers before credential/order/gateway work, but this final live pass does not claim an HTTP response verification.
