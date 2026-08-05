# Admin release audit

Date: 2026-08-05  
Target: `https://boutq.store` / Pura brand workspace  
Scope: authentication, dashboard, brands, team/roles, categories, inventory, orders, customers, discounts, expenses, reports, pages, campaigns, communications, integrations, settings, tenant boundaries, validation, responsive behavior, and localization.

## Executive status

This is a **partial live audit**, supplemented by repository tests. The supplied login credentials were rejected by the live login form with the localized invalid-email-or-password message. Chrome already held an authenticated Pura brand-admin session, which allowed the authenticated checks below. Authentication with the supplied password is therefore not verified.

Live testing later stopped because Chrome blocked automation while another extension UI was open. To continue, dismiss or complete that extension UI in Chrome and resume this audit. No real-looking record, integration, secret, permission, or outbound communication was changed.

## Live evidence completed

### Authentication and route access

- `/auth` loaded successfully with a complete Arabic login form, password-reset link, remember-me control, passkey option, language selector, and return-home link.
- Submitting the supplied credentials produced the Arabic invalid-credentials notification and did not navigate away from `/auth`.
- Navigating to `/admin` with Chrome's pre-existing authenticated session resolved to `/admin/b/pura/dashboard`.
- The Pura dashboard rendered live KPIs, sales trend, actionable orders, latest orders, and low-stock alerts without sampled console warnings/errors.
- Direct navigation was attempted for dashboard, orders, customers, inventory, categories, discounts, expenses, reports, pages, campaigns, communications, integrations, settings, and team. Each settled on its expected Pura route (campaigns additionally canonicalized to `?segment=All`). This proves routing only; it does not prove every action on each page.
- The team page rendered six members and exposed active/inactive state, roles, phone/WhatsApp where available, and activate/deactivate actions. No role or member was modified.

### Customer validation, CRUD, and persistence

- Customer list loaded 11 existing customers.
- Blank customer submission remained in the dialog and displayed a required-name notification.
- Name/phone/email without a delivery address remained in the dialog and displayed: “Please fill area, block, road, and building” (localized Arabic in the UI).
- Created one uniquely named disposable customer: **Codex Admin Audit 20260805**, using non-production audit contact/address data.
- The dialog closed, a save notification appeared, the customer count increased from 11 to 12, and the record appeared in the list.
- After a full page reload, the record remained present, proving live write and read-back persistence for this flow.
- On the propagated build, the table exposed a customer-specific Delete action and confirmation. Only **Codex Admin Audit 20260805** was deleted, and its absence persisted after reload. No disposable audit customer remains.

### Inventory disposable CRUD

- Blank product Save left the New Product dialog open without a visible field error or notification.
- Created one bilingual, inactive product named **Codex Inventory Audit 20260805**, priced BHD 1.000 with no variants.
- The product count increased from 4 to 5; it appeared in the list and persisted after reload once asynchronous loading completed.
- Selecting **Delete Product** removed it immediately, without a confirmation step. The count returned to 4 and absence persisted after reload. No audit product remains.

### Orders and access boundaries

- Live Orders loaded 76 records with status scopes, search, filters, archive control, payment/fulfillment/courier data, next actions, and order options.
- Existing audit orders demonstrated COD, online, BenefitPay, cancelled, delivered, on-hold, and needs-packing states. No lifecycle state was changed because the records contain real catalog items and the actions can adjust stock.
- The console recorded an orders realtime-channel transport failure. Initial query data still loaded, but cross-session live refresh was not reliable in this sample.
- A direct request to a deliberately nonexistent brand slug rendered no brand data and redirected safely to the authorized Pura dashboard. Isolation from a second real tenant remains unverified.

### Tap card payment verification — live pass with metadata gap

- The newest order was **#1085**, internal ID `1f4f3a79-c760-4b5c-9d93-b235377fc161`.
- Customer: **Codex Tap Audit**; test contact displayed as `00000000` and the disposable audit email.
- Amount: **BHD 24.000**; one Abaya Code PR2, SKU PR2-54, size 54.
- Payment method: **Card**; payment status: **Paid**; order status: **Confirmed**; fulfillment: **Needs Packing**; pickup from Boutique Noor — Sitra.
- After a full page reload, order number, customer, amount, Card, Paid, and Confirmed all remained present. Payment/order state persistence passed.
- No Tap charge ID, transaction ID, gateway reference, or payment reference is displayed anywhere in the admin order detail/invoice views. The gateway reference therefore could not be reconciled from the admin UI.
- No order field or status was mutated during this verification.

### Tap declined-payment order — read-only evidence

- Newest declined-payment record: **Order #1086**, internal ID `c60c435f-eb21-435c-8191-c4db708e46ae`.
- Customer: **Codex Tap Decline Audit**; payment method **Card**; payment status **Unpaid**; fulfillment status **On Hold**.
- Amount: **BHD 23.000**; one **Abaya**, SKU **PLR-52**, size **52**, quantity 1, unit price BHD 23.000.
- Fulfillment: **Pickup from Branch**, pickup location **Boutique Noor — Sitra**.
- Internal note explicitly identifies it as a disposable Tap decline QA order.
- The Order status control rendered with an empty value/text rather than Draft, Pending, Failed, Cancelled, or another explicit lifecycle state. The orders list exposed the next action as View.
- The supplied Tap reference `TS06A0520261601Nk8r0508739` and any gateway charge/transaction/reference ID were not visible in the admin list or order detail.
- A full reload preserved order #1086 and its customer/item details. No field was changed, cancelled, or deleted.

### Fresh declined-payment/idempotency retest — read-only failure

- Exactly one new order appeared after the fresh attempt: **#1087**, internal ID `78410427-6888-4f15-a773-6989cbcca9b8`. The previous newest order was #1086; no second duplicate appeared.
- Customer **Codex Tap Decline Fix Audit**; Card; **Unpaid**; fulfillment **On Hold**; total **BHD 23.000**.
- One Abaya, SKU **PLR-52**, size 52, quantity 1; pickup from Boutique Noor — Sitra.
- Order status remains blank rather than Confirmed or an explicit Failed/Pending state.
- Stock evidence indicates a one-unit deduction despite the declined/unpaid payment: the earlier #1086 detail displayed `Direct Sales · Main (4)` for this SKU; #1087 now displays `Direct Sales · Main (3)`. This decrease matches the new one-unit order.
- The order Activity History says no activity recorded, so it does not disclose or explain the stock movement.
- No order, payment, or inventory data was mutated during verification. Live presence of the snapshot-preservation migration cannot be established from the admin UI alone.

### Responsive and localization

- At the 390x844 mobile override, the Customers workspace had no document-level horizontal overflow (`scrollWidth` equaled `clientWidth`).
- The desktop table was replaced by readable customer cards; mobile navigation exposed Home, Orders, Inventory, Customers, and More.
- The primary customer scopes reduced to All, VIP, and an accessible More menu rather than overflowing.
- The document direction was RTL in Arabic.
- Switching to English updated the header, navigation, page title, description, controls, search, cards, currency, and WhatsApp label; the Arabic-switch control remained available.

## Verified findings

### P0 — Declined card attempt deducts sellable stock

**Evidence:** Before the fresh decline, order #1086 showed Abaya SKU PLR-52 at `Direct Sales · Main (4)`. The single new declined/unpaid order #1087, quantity 1 for the same SKU, shows `Direct Sales · Main (3)`. Order #1087 is Card / Unpaid / On Hold with blank order status, yet the available stock decreased by one. Its Activity History contains no entry.

**Impact:** Failed payments reserve or consume inventory without revenue, creating false out-of-stock states, blocking valid purchases, and making stock reconciliation impossible.

**Recommendation:** Do not deduct inventory for card orders until a verified successful Tap callback transitions payment to Paid/authorized. If temporary reservation is required, model it separately with expiration and atomic release on decline/timeout. Record every reserve/deduct/release event in the order and inventory audit logs, and add idempotent webhook tests proving one success deducts once while decline/duplicate callbacks deduct zero.

**Root cause:** `place_storefront_order_internal_20260710` deducts each variant during order creation and unconditionally sets `stock_deducted=true`, even though storefront card orders are initially `payment_status='unpaid'` and payment completes later. The Tap redirect only marks successful charges Paid/Confirmed; declined charges retain the unpaid order, so the eager deduction remains. The existing `sync_order_stock` policy is driven mainly by order status and does not protect this creation path.

**Implemented locally (not deployed):** Migration `20260805193000_defer_card_stock_until_paid.sql` installs a database trigger limited to normalized card/Tap aliases. It reverses the legacy eager deduction whenever a card order is unpaid, then locks and deducts variants exactly once when a verified callback first changes payment status to Paid. `stock_deducted` plus recursion protection makes duplicate callbacks idempotent. COD and other payment methods retain their existing behavior. The migration includes an idempotent repair for existing unpaid card orders that still have a stock snapshot.

**Safe rollout strategy:** Apply in staging first; verify an unpaid/declined card order restores stock and a successful card callback deducts once under duplicate callback replay. Confirm COD creation/delivery behavior is unchanged. Before production migration, snapshot affected order/variant rows and review the repair set (`unpaid card + stock_deducted + stock_snapshot`). The paid transition intentionally raises `INSUFFICIENT_STOCK` rather than silently overselling; operations need a documented capture/refund exception path for that rare race. No migration or repair was applied live during this audit.

### P0 — Storefront fulfillment confirmation conflicts with persisted admin order

**Evidence:** The storefront success URL/copy for the Tap test reported `fulfillment=delivery` and delivery-confirmation messaging. Re-opening persisted order #1085 in admin showed all of the following simultaneously: summary **Pickup from branch**, Fulfillment method **Pickup from Branch**, Pickup location **Boutique Noor — Sitra**, fulfillment badge **🏪 Pickup**, and action **Prepare for Pickup**. No street/block/road delivery address is present; the section titled “Delivery address” contains only customer name, email, and phone.

**Impact:** Staff may prepare a paid delivery order for branch pickup, while the customer expects delivery. This can cause failed fulfillment, customer complaints, refund risk, and incorrect courier/inventory operations.

**Recommendation:** Block launch until the checkout selection, payment-create payload, redirect state, webhook/order persistence, thank-you rendering, and admin order model use one canonical fulfillment value. Add an end-to-end assertion that the selected fulfillment method and address/branch remain identical before payment, after Tap redirect, in the database, thank-you page, invoice, and admin detail.

### P0 — Reused guest CRM identity rewrites historical order display

**Evidence:** Order #1085 originally displayed `Codex Tap Audit`. After the later declined checkout #1086 reused phone `00000000`, a hard reload of #1085 displayed `Codex Tap Decline Audit — 00000000` while its payment/amount/status remained Paid / BHD 24.000 / Confirmed. No console error occurred. The checkout core can match a guest customer by phone and update that mutable CRM row; admin rendering falls back to the linked `customers` row when snapshots are absent.

**Impact:** Historical invoices/orders can appear to belong to a later buyer, corrupting support, fulfillment, reporting, dispute, and audit evidence.

**Implemented locally (not deployed):** Migration `20260805190000_preserve_order_customer_identity.sql` adds a before-insert/customer-link-update trigger that fills missing order snapshots from the customer row and never overwrites an existing snapshot. Display helpers now prefer all order-local legacy identity fields before the mutable CRM relation. Regression tests cover snapshot precedence, legacy order-local precedence, and safe legacy fallback.

**Constraint:** The migration intentionally does not backfill historical NULL snapshots from current CRM rows because those rows may already be overwritten. Order #1085 requires authoritative backup/audit recovery of its original snapshots. The SQL migration was not applied to any live database during this audit.

### P1 — Supplied release-test credentials fail on production

**Evidence:** A single login submission at `https://boutq.store/auth` with the supplied account returned the localized “email or password is incorrect” notification and remained on `/auth`.

**Impact:** A clean-browser administrator cannot be proven able to sign in with the provided release account. All authenticated live evidence in this audit relied on a previously authenticated Chrome session.

**Recommendation:** Reset or verify the account password, then repeat login in a clean browser/profile, verify logout, session expiry, password reset, inactive-user behavior, and re-login. Do not treat the existing-session access as proof that the supplied credentials work.

### P1 — Privilege boundaries and tenant isolation remain unverified live

**Evidence:** Only one authenticated Pura brand-admin session was available. Current repository Playwright admin suites intercept Supabase traffic with mock auth/profile/brand/data responses, so they cannot prove deployed RLS, role enforcement, or cross-brand isolation.

**Impact:** A staff member may have excess access, or a direct URL/data request may cross tenant boundaries, without the current evidence detecting it.

**Recommendation:** Before launch, use at least two brands and one restricted staff role. Test direct list/detail/export URLs, mutations, files, revoked sessions, and role-by-role action visibility/enforcement.

### P1 — Declined card attempt persists an order with blank lifecycle status

**Evidence:** Declined Tap order #1086 persisted as Card / Unpaid with fulfillment On Hold, but the admin Order status combobox contains an empty span/value. The gateway reference is also absent from the UI.

**Impact:** Staff cannot distinguish a payment-declined holding record from an incomplete draft or malformed order. Blank status values can bypass filters, automation, reporting, and cleanup policies.

**Recommendation:** Persist an explicit non-fulfillable state such as `payment_failed` or `pending_payment`, map it consistently in list/detail/reporting, prevent stock/fulfillment actions until paid, and retain the gateway reference and failure reason in the payment audit record.

### P1 — Successful card payments have no visible gateway reference

**Evidence:** Order #1085 is persisted as Card / Paid / Confirmed for BHD 24.000, but its admin order detail and invoice views expose no Tap charge ID, transaction ID, payment reference, or gateway reference.

**Impact:** Support and finance staff cannot reconcile a customer charge with Tap, investigate disputes, distinguish callbacks, or prove which gateway transaction marked the order paid from the admin interface.

**Recommendation:** Display the masked Tap charge/reference ID, gateway status, authorization/capture timestamps, callback verification state, and a copyable audit reference in a read-only Payment Details section. Never display card PAN/CVV.

### P1 — Product deletion has no confirmation step

**Evidence:** Selecting Delete Product from the live Inventory action menu permanently removed the disposable product with no alert dialog, browser confirmation, second click, undo, or typed confirmation. Reload confirmed removal.

**Impact:** A single mis-click can permanently remove a catalog item and affect storefront and operational workflows.

**Recommendation:** Add an explicit destructive confirmation naming the product and prefer an archive/restore flow where possible.

**Post-deploy retest (version requested as `ff684b56…`): FAILED.** After reloading the existing signed-in admin tab, selecting Delete Product for **Abaya Code PR1** still deleted immediately, produced a Delete toast, rendered no alert dialog, and removed the product from the live list. The confirmation fix was not active in the tested live bundle/session. This retest unintentionally removed that real product because the destructive action occurred before any expected confirmation; recovery from database backup/audit history is required. Further mutations were stopped.

#### Read-only incident evidence

- Incident page URL: `https://boutq.store/admin/b/pura/inventory`. The UI never opened a product-specific URL during deletion.
- Product identity visible immediately before deletion: **Abaya Code PR1**; displayed ID prefix **`c2267ed2`**. The full UUID was not exposed in the DOM snapshot and was not captured.
- Displayed category: **abayas**.
- Displayed summary: **4 variants**, **Out of Stock**, **BHD 24.000** base/display price.
- Individual variant SKUs, per-variant prices/stock, image URL, and full product ID were not expanded or captured before deletion. They cannot be reconstructed responsibly from the remaining UI.
- Action sequence: More product actions → Delete Product. The page showed a **Delete** toast, no alert dialog, and the row disappeared. A subsequent read-only check confirmed `Abaya Code PR1` was absent.
- Approximate incident window: 2026-08-05 shortly before 18:55 Asia/Bahrain. The UI/toast exposed no deletion timestamp or operation ID.
- The Inventory **Activity History** showed stock-change events only. It contained no product-deletion entry, deleted-product payload, actor, product ID, timestamp, or rollback link for this incident.
- Captured browser console logs contained no deletion request metadata, product payload, error, or recoverability information.
- No Trash, Archive, Deleted Products, Undo, Restore, Recover, or rollback UI was visible on the Inventory page.
- Recovery must therefore use authoritative backend/database audit logs, point-in-time recovery, backup, or provider-side records. No restoration attempt was made during this read-only evidence pass.

**Propagated-build retest: PASS.** After the later deployment propagated, selecting Delete Product for **Abaya Code PR2** opened an alert dialog titled “Delete product” with product-specific copy, Cancel, and Delete. Cancel was selected; PR2 remained present and no deletion occurred. This fixes the confirmation behavior for the currently served build, while the earlier PR1 deletion incident still requires recovery.

### P1 — Customer deletion is unreachable from the UI

**Evidence:** The live customer list and detail page expose no customer-delete action. Repository code defines `del()` and passes `onDeleteCustomer` to `CustomersWorkQueue`, but that component never renders or invokes it.

**Impact:** Administrators cannot clean up duplicate, accidental, or disposable zero-order customers through the supported UI.

**Recommendation:** Add a confirmed delete/archive action for zero-order customers; archive or anonymize customers referenced by orders.

**Propagated-build retest: PASS for zero-order customer cleanup.** The customer table rendered an accessible `Delete customer Codex Admin Audit 20260805` action. It opened a customer-specific confirmation dialog. Confirming deletion removed only that disposable zero-order customer; it remained absent after a full reload. No disposable audit customer remains.

### P2 — Blank product submission gives no visible guidance

**Evidence:** Saving a completely blank New Product form left the dialog open without a visible toast, inline error, or focus announcement.

**Recommendation:** Add localized inline errors, focus the first invalid field, and announce an error summary.

### P2 — Orders realtime subscription reported transport failure

**Evidence:** The live Orders page logged a realtime channel transport failure while the initial list remained usable.

**Recommendation:** Add reconnect/backoff and a visible stale/live-disconnected indicator; verify cross-session updates.

### P2 — Not-found and operational failures share a misleading generic state

**Evidence:** `src/routes/_authenticated/admin.b.$slug.route.tsx` assigns the same `BrandError` component to `errorComponent` and `notFoundComponent`. Its copy describes a temporary connection issue or expired session, which is inaccurate for an unknown route.

**Recommendation:** Use a specific 404/invalid-location state for unknown routes and retain retry/session guidance only for operational failures.

### P2 — Full visual-regression coverage is absent

**Evidence:** Current responsive tests primarily verify classes, element counts, accessible controls, visibility, and overflow. They do not maintain approved screenshot baselines for every admin route, language, and breakpoint.

**Recommendation:** Add screenshot baselines at 390x844, 768x1024, 1440x900, and a wide desktop viewport in English and Arabic for every primary route and modal.

## Automated evidence completed

Focused repository suite result:

- 7 test files passed
- 25 tests passed
- Covered admin dialog validation, inventory controls, order workflow, security-route regressions, and responsive scope components for inventory, customers, expenses, reports, campaigns, discounts, communications, pages, integrations, and settings

Several browser tests mock Supabase responses, so this evidence is useful for regression but cannot replace deployed end-to-end acceptance.

## Remaining live release matrix

| Area               | Status                        | Required evidence                                                                                   |
| ------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Login/session      | **Failed/blocked**            | Working supplied account in a clean browser; logout, re-login, expiry, reset, inactive account      |
| Dashboard          | Partial pass                  | Filter interactions, KPI reconciliation, empty/loading/error states                                 |
| Customers          | Partial CRUD pass             | Create/delete persistence and confirmations passed; edit and duplicate validation remain            |
| Team/roles         | Read-only pass                | Invite/edit/deactivate disposable member; least privilege and revoked-session enforcement           |
| Tenant isolation   | Unverified                    | Second brand and restricted role; list/detail/export/mutation/file isolation                        |
| Inventory/products | Partial CRUD pass             | Create/read/delete persistence and propagated confirmation passed; variants/images/stock remain     |
| Orders             | Read-only pass                | Lifecycle mutations, status guards, invoice, inventory effects, repeated clicks, realtime reconnect |
| Categories         | Route only                    | Create/edit/reorder/delete constraints, duplicates, bilingual values                                |
| Discounts          | Route only                    | Create/edit/activate/expire/caps, time boundaries, storefront effect                                |
| Expenses           | Route only                    | Disposable CRUD, amount/date validation, totals and export                                          |
| Reports            | Route only                    | Sales/products/customers/export reconciliation, timezone and currency                               |
| Pages              | Route only                    | Draft/publish/unpublish/reorder and storefront visibility                                           |
| Campaigns          | Route only                    | Draft CRUD and audience validation; no external send                                                |
| Communications     | Route only                    | Logs, filters, empty/error states; no outbound send                                                 |
| Integrations       | Route only                    | Read-only status, masked secrets, failure handling; no connection changes                           |
| Settings           | Route only                    | Validation and persistence for safe disposable fields; security and tenant boundaries               |
| Responsive/visual  | Customers mobile partial pass | Remaining routes at phone/tablet/desktop/wide, EN/AR, modals, keyboard/focus, zoom                  |

## Admin release recommendation

**NO-GO pending P1 fixes and critical evidence.** Customer creation/persistence, inactive product create/read/delete persistence, basic routing, invalid-brand rejection, dashboard rendering, and customer mobile localization worked live. Before launch, resolve the supplied-account login failure, add product-delete confirmation, restore a supported customer delete/archive action, and complete order lifecycle, staff-permission, and two-brand isolation checks. The remaining disposable customer cannot be removed through the current admin UI.
