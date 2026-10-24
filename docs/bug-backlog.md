# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #40 is fixed.

## #44 The order editor and a booking's repricing tax points that the redemption does not

Found 2026-10-24 while fixing #43. Redeeming points (`redeem_loyalty_points_for_order`) treats them as a payment: the order's tax stays what it was before the points, and the points are added to `orders.discount`. Two other paths read that discount as a discount before tax and work the tax out again on what is left: the order editor's `orderTotals` in `src/features/orders/lib/order-editor.ts` (when staff save an order) and `reprice_order_totals` (when a booking's add-ons or offer change). At a store whose prices exclude 10% VAT, a 40.000 order with 3.000 of points is charged 41.000 (tax 4.000); saved again from the editor it becomes 40.700 (tax 3.700). At a VAT-inclusive store the total agrees (37.000) but the tax recorded moves from 3.636 to 3.364. Which is right is a tax decision for the owner: are points a discount on the price, so the tax is on what is left, or a way of paying, so the tax stays? Whichever is chosen, the redemption, the editor, the repricing and the checkout's twin (`orderTotals` in `src/lib/order-tax.ts`, run against the database by `tests/order-tax-parity.test.ts`) must say the same.
