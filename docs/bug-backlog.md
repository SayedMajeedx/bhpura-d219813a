# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

## Orders (`src/routes/_authenticated/admin.b.$slug.orders.$id.tsx`, `src/features/orders/`)

### 11. The three "add item" paths build lines differently

- **Where**: the order editor's `handleSelectVariantFromModal` (search), `handleScanned` (barcode) and `pickVariant` (variant picker).
- **Problem**:
  - The search path sets `original_price` to the selling price. The other two use the variant's `original_price`, so a sale item added by search looks undiscounted. This may affect the promo rule `NO_ELIGIBLE_ITEMS` and the sale display on invoices.
  - The search path joins the description with `" — "`; the other two use newlines.
  - The search path sets no `custom_field_values`.
- **Fix**: one pure `orderItemFromVariant(variant, product, axes)` in `src/features/orders/lib/order-editor.ts`, used by all three, with tests. Agree the `original_price` rule with the owner first.

### 14. Courier "delivered" writes twice, and its fallback cannot write

- **Where**: `src/components/orders/CourierOrderView.tsx`, `updateStatus("delivered")`.
- **Problem**: after `courier_update_delivery` succeeds, the view still sends a direct `orders` update, with `payment_status` computed from `Math.max(orderTotal, …)` (always "paid") and `fulfillment_status: "COMPLETED"` over the RPC's `delivered`. Couriers have no UPDATE policy on `orders`, so that update is filtered out silently: when the RPC fails, the "fallback" never writes either. `codConfirmed || true` is always true.
- **Fix**: rely on the RPC alone for couriers (it already checks the assignment and the cash due), surface its errors (`COD_AMOUNT_MISMATCH`, `COD_CONFIRMATION_REQUIRED`), and drop the direct update and the `|| true`.

## Customers (`src/lib/data/customers`, `src/routes/_authenticated/admin.b.$slug.customers*`)

### 17. Customer address writes that ignore their errors

Found while moving customers into `src/lib/data/customers`. The calls kept their behaviour and point here.

- **Where**:
  - `setDefaultCustomerAddress` (used by the customers list's address editor, `src/components/customer-address-manager.tsx` and the storefront account page `src/routes/$slug.account.tsx`): clearing the old default ignores its error. The account page's "add address as default" does the same (`clearDefaultCustomerAddress(...).catch(() => undefined)`).
  - `src/features/orders/components/NewCustomerDialog.tsx`: the new customer's address (`createCustomerAddress(...).catch(() => null)`).
- **Effect**:
  - If clearing fails and setting succeeds, the customer has two default addresses, and screens that take "the default" pick either one.
  - The order editor's "new customer" can create the customer without the address the merchant typed, show a success toast, and leave the order with no shipping address.
- **Fix**: stop when clearing fails (or clear and set in one update / RPC). In the dialog, show the address error and keep the dialog open with the customer already created.

### 18. The loyalty adjustment dialog offers only the first 100 customers

- **Where**: `src/components/loyalty/LoyaltyManualAdjustmentDialog.tsx`: `customersQueries.directory(brandId, 100)` (before: `.order("name").limit(100)`).
- **Problem**: the customer selector is a plain list of the first 100 customers by name, with no search. The placeholder says "search or choose".
- **Effect**: in a brand with more than 100 customers, points cannot be awarded or deducted by hand for anyone past the 100th name.
- **Fix**: a searchable picker (`searchCustomers` already exists in `@/lib/data/customers`), or the push centre's 1000 limit as a stopgap.

## Inventory (`src/features/inventory/`)

### 2. Duplicating a product drops variant and product fields

- **Where**: `lib/product-list.ts`, `duplicateProductValues` and `duplicateVariantValues`.
- **Problem**:
  - Variant copies omit `size_unit`, `option_four`, `option_five`, `image_url` and `original_price`.
  - The product copy omits `cost_price`, the `variant_label_*` overrides, `show_sale_badge`, `featured_trending`, `size_guide_*` and `is_made_to_order`.
- **Effect**: the copy's variants lose their unit, extra options and images. A coffee "250 g" becomes "250", and the copy shows no cost or margin.
- **Fix**: copy the missing columns. Decide whether sale prices and `featured_trending` should carry over, then update `tests/inventory-product-list.test.ts`.

### 3. Bulk "Set Price" and "Cost Markup %" leave `original_price` stale

- **Where**: `hooks/use-variant-bulk-actions.ts`, `bulkSetPrice` (`.update({ selling_price: price })`) and `bulkApplyMarkup`.
- **Problem**: an inline price edit sets `original_price` to the regular price when the new price is below it, and to `null` otherwise (`variantColumnPatch` in `lib/variant-draft.ts`). The bulk actions only set `selling_price`.
- **Effect**: sale badges and struck-through prices go wrong after a bulk price change. For example, a variant on sale set back to full price keeps showing a discount.
- **Fix**: apply the same `original_price` rule per variant, reusing `variantColumnPatch`.

### 4. Barcode duplicate check differs between adding and editing a variant

- **Where**: `hooks/use-variant-mutations.ts`, `update`: `other.barcode === patch.barcode?.trim()`.
- **Problem**: adding uses `isBarcodeInUse`, which ignores case and scanner control characters. Editing compares the raw strings.
- **Effect**: editing can save a barcode that differs from an existing one only by case or by a trailing scanner character.
- **Fix**: use `isBarcodeInUse(variants, patch.barcode, v.id)` in `update`.

### 5. Cost typed in the desktop "add variant" row is ignored

- **Where**: `components/VariantAddRow.tsx` has an editable cost input (`setRow({ ...row, cost_price: … })`, shown in the full view). `lib/variant-draft.ts`, `newVariantValues`, always saves `cost_price: Number(product?.cost_price ?? 0)`.
- **Effect**: the merchant types a cost, saves, and the variant has the product's cost instead.
- **Fix**: product decision. Either save `row.cost_price` or make the input read-only like the mobile form (`VariantAddCard.tsx`). Note that saving the product later resets every variant's cost to the product cost (`use-save-product.ts`), so a per-variant cost does not survive that either.

### 6. Markup prompt example is wrong

- **Where**: `hooks/use-variant-bulk-actions.ts`: `"Enter markup percentage (e.g. 50 for 55%):"`.
- **Fix**: `"e.g. 50 for 50%"`.

### 7. Custom-preset CSV import turns a stock of 0 into 10

- **Where**: `lib/product-import.ts`: `parseInt(row[finalMappings.stock]?.replace(/[^\d]/g, "") || "0") || 10`.
- **Problem**: `parseInt("0")` is `0`, which is falsy, so `|| 10` replaces it.
- **Effect**: products imported as out of stock arrive with 10 units.
- **Fix**: default to 10 only when the cell is empty (`Number.isNaN` check), and add a test.

### 8. Import header detection matches substrings

- **Where**: `lib/product-import.ts`, `detectProductColumns`: `header.toLowerCase().includes(alias.toLowerCase())`.
- **Problem**: the alias "price" matches the header "Cost price", and the first match wins.
- **Effect**: a CSV with both "Cost price" and "Price" columns can map the cost as the selling price.
- **Fix**: prefer exact matches, then word-boundary matches, and never map one column to two fields. Add tests with real Shopify/Salla headers.

### 9. `cleanPassportCustomFields` does nothing

- **Where**: `lib/product-form.ts`, `cleanPassportCustomFields(fields)` returns `fields` unchanged.
- **Problem**: the name says it strips fit-passport fields before saving a product, but it strips nothing.
- **Fix**: find out what it was meant to remove (git history, `src/addons/fit-passport/`). Implement it with a test, or delete it.

### 16. Catalog writes that ignore their errors

Found while moving the catalog writes into `src/lib/data/catalog` (the calls now end in `.catch(() => undefined)`, or the mutation says so, and point here).

- **Where**:
  - `hooks/use-save-product.ts`: the automatic default variant, both when an active product with no variants is saved and when a product is created.
  - `hooks/use-product-actions.ts`, `handleDuplicateProduct`: copying the variants to the duplicate.
  - `hooks/use-variant-mutations.ts`, `add`: setting the product's colour/option axis label.
  - `src/lib/data/catalog/mutations.ts`, `applyBomToAllProducts` (the BOM editor's "apply to all products"): the direct-cost update and the removal of the old BOM lines.
  - `src/lib/packaging-sync.ts`, `syncPackagingExpensesToInventory`: the cost/stock update of an existing material (counted as "updated" even when it failed), and every write in `syncSingleExpenseToPackagingMaterial`.
- **Effect**:
  - A product can be saved or duplicated with no variant while the success toast shows, so it cannot be bought.
  - "Apply to all" can fail to delete the old lines and then insert the new ones, so every product has its packaging lines twice and packaging cost (COGS) doubles. It is also not atomic: a failure halfway leaves some products changed.
  - The sync reports materials as updated when they were not.
- **Fix**: surface the errors (toast, stop before the next step). For "apply to all", stop on the first error, ideally as one server-side transaction (RPC). In the sync, count only successful writes.

## Categories (`src/routes/_authenticated/admin.b.$slug.categories.tsx`, `src/lib/data/categories`)

### 20. Reordering categories ignores write errors

- **Where**: the Categories page's up/down buttons (`move`), through `setCategorySortOrders`.
- **Problem**: the position updates run in parallel and their errors are never read. When two categories share a position, every category is renumbered in one batch, so a partial failure leaves a mixed order.
- **Effect**: a failed move shows no error and the list simply refreshes into the old (or a half-applied) order.
- **Fix**: read the errors and toast on failure; ideally one RPC that rewrites the order in a transaction.

## Checkout (`src/routes/$slug.checkout.tsx`, `src/features/checkout/`)

### 19. The thank-you page's order lookup can never read the order

- **Where**: `src/routes/$slug.thank-you.$orderId.tsx`, `storefrontQueries.orderConfirmation` (`fetchOrderConfirmation` in `src/lib/data/storefront/queries.ts`).
- **Problem**: the page reads the order's `fulfillment_method` and `digital_delivery_channel` "to prevent URL manipulation", but through `publicSupabase`, which stays anonymous even for a signed-in shopper, and `orders` has no policy for anonymous reads (checked live: only office, courier and `storefront_user_owns_customer` policies). The read always returns null.
- **Effect**: the page always shows the pickup / delivery / digital message from the URL (`?fulfillment=&channel=`). The payment redirect sets those from the order server-side, so the message is right in practice, but a changed URL changes it, and the lookup costs a request for nothing.
- **Fix**: either drop the lookup and trust the server-built redirect, or read it through a narrow `security definer` RPC keyed by order id plus the order's public token, then update the checkout browser test.

### 12. "Choose another payment method" does nothing

- **Where**: `components/PaymentFailedCard.tsx`, the outline button scrolls to `document.getElementById("payment-methods-section")`.
- **Problem**: no element has the id `payment-methods-section`, so after a failed card payment the button does nothing.
- **Fix**: give the payment method card (`components/PaymentMethodCard.tsx`) that id, and cover the button in the checkout browser test.
