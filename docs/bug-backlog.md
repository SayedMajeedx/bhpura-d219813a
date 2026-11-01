# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #50 is fixed.

## 51. The product import invents a price, a stock and a description

Found 2026-11-01 while making the default variant blank. `src/features/inventory/lib/product-import.ts` fills what a file does not say: a row with no price column, or an empty price, is sold at **10** (`let priceVal = 10.0`, `|| 10.0` in every preset); a row with no stock column gets **10 pieces** (`: 10`, `stockFromCell(..., 10)`), which the opening-ledger trigger then records as real stock; and every product's description is written as "تم الاستيراد بنجاح" / "Imported product details", which the product page shows. The server's own fallback (a product sent with no variants, `src/lib/universal-importer.ts`) invented 15 and 50 pieces and is fixed. What it should do: a missing price stops the row in the preview with a reason (or imports it hidden until priced), a missing stock is 0, and a missing description stays empty. Fix with a test that imports a file with no price and no stock columns.
