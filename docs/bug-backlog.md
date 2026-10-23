# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #40 is fixed.

## #43 Points taken off an order add its VAT again when prices include it

Found 2026-10-23 while fixing #42. `redeem_loyalty_points_for_order` (migration `20261007150000`) writes the order's total as `subtotal - (discount + points) + shipping + tax_amount`. For a store whose prices exclude VAT that is right (the tax stays as it was before the points). For a store whose prices include VAT (`vat_inclusive = true`) the tax is already inside the subtotal, so redeeming points adds it a second time: a 40.000 order with 3.000 of points comes to 40.636, not 37.000. No live store includes VAT in its prices today (zh and aurora exclude it, the others charge none), so nobody has paid it. The checkout's twin (`orderTotals` in `src/lib/order-tax.ts`) says what the database charges, this included, and `tests/order-tax-parity.test.ts` runs both: fix the function (a migration) and the twin together.
