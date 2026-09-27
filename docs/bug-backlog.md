# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

## Orders (`src/routes/_authenticated/admin.b.$slug.orders.$id.tsx`, `src/features/orders/`)

### 14. Courier "delivered" writes twice, and its fallback cannot write

- **Where**: `src/components/orders/CourierOrderView.tsx`, `updateStatus("delivered")`.
- **Problem**: after `courier_update_delivery` succeeds, the view still sends a direct `orders` update, with `payment_status` computed from `Math.max(orderTotal, …)` (always "paid") and `fulfillment_status: "COMPLETED"` over the RPC's `delivered`. Couriers have no UPDATE policy on `orders`, so that update is filtered out silently: when the RPC fails, the "fallback" never writes either. `codConfirmed || true` is always true.
- **Fix**: rely on the RPC alone for couriers (it already checks the assignment and the cash due), surface its errors (`COD_AMOUNT_MISMATCH`, `COD_CONFIRMATION_REQUIRED`), and drop the direct update and the `|| true`.

## Customers (`src/lib/data/customers`, `src/routes/_authenticated/admin.b.$slug.customers*`)

### 17. Setting a default address ignores the clearing error

Found while moving customers into `src/lib/data/customers`. (The order editor's "new customer" address is fixed: the dialog stays open to retry it.)

- **Where**: `setDefaultCustomerAddress` (used by the customers list's address editor, `src/components/customer-address-manager.tsx` and the storefront account page `src/routes/$slug.account.tsx`): clearing the old default ignores its error. The account page's "add address as default" does the same (`clearDefaultCustomerAddress(...).catch(() => undefined)`).
- **Effect**: if clearing fails and setting succeeds, the customer has two default addresses, and screens that take "the default" pick either one.
- **Fix**: clear and set in one transaction (RPC), with #21 and #20.

## Messages (`src/lib/data/message-templates`)

### 21. Making a template the default ignores the clearing error

- **Where**: `src/components/orders/SendInvoiceDialog.tsx` (manage templates), through `clearDefaultMessageTemplate`.
- **Problem**: the old default is cleared without reading the error, then the new one is saved. (The clearing itself used to run across every brand of the user; it is scoped to the brand since the data-layer move.)
- **Effect**: if clearing fails, the brand has two default templates and the dialog preselects either one.
- **Fix**: stop when clearing fails, or clear and set in one update / RPC (same shape as #17).

## Inventory (`src/features/inventory/`)

### 16. "Apply to all products" ignores its errors and is not atomic

Found while moving the catalog writes into `src/lib/data/catalog`. (The other writes of this entry are fixed: the default and duplicated variants, the option label and the packaging sync now report their errors.)

- **Where**: `src/lib/data/catalog/mutations.ts`, `applyBomToAllProducts` (the BOM editor's "apply to all products"): the direct-cost update and the removal of the old BOM lines ignore their errors.
- **Effect**: "Apply to all" can fail to delete the old lines and then insert the new ones, so every product has its packaging lines twice and packaging cost (COGS) doubles. A failure halfway leaves some products changed.
- **Fix**: one server-side transaction (RPC).

## Categories (`src/routes/_authenticated/admin.b.$slug.categories.tsx`, `src/lib/data/categories`)

### 20. Reordering categories ignores write errors

- **Where**: the Categories page's up/down buttons (`move`), through `setCategorySortOrders`.
- **Problem**: the position updates run in parallel and their errors are never read. When two categories share a position, every category is renumbered in one batch, so a partial failure leaves a mixed order.
- **Effect**: a failed move shows no error and the list simply refreshes into the old (or a half-applied) order.
- **Fix**: read the errors and toast on failure; ideally one RPC that rewrites the order in a transaction.
