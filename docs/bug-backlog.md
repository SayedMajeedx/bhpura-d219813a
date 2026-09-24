# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

## Inventory (`src/features/inventory/`)

### 1. Categories cache key shared by three different queries

- **Where**: `hooks/use-inventory-categories.ts`, `hooks/use-product-dialog-data.ts` and `src/routes/_authenticated/admin.b.$slug.categories.tsx` all use `queryKey: ["categories", brandId]`.
- **Problem**: the three return different data. The Categories page loads all categories (`select("*")`, including inactive ones). The inventory list loads active ones only and returns `[]` on error. The product editor loads active ones only and throws on error. Whichever runs first fills the shared cache.
- **Effect**: after the Categories page is opened, the inventory category filter, the bulk "Change category" dialog and the product editor can show inactive categories.
- **Fix**: give each shape its own key, ideally through an admin data module (`src/lib/data/`, Phase 4 pattern), e.g. `["admin", brandId, "categories", "active"]`. Keep the invalidations in the Categories page working for both keys.

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
