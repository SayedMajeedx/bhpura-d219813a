# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #40 is fixed.

## #42 The storefront checkout leaves out tax the order then charges

Found 2026-10-23 while working on booking deposits. A store whose prices exclude VAT (`business_settings.default_tax_rate > 0`, `vat_inclusive = false`; live: `zh` and `aurora`, 10%) has the tax added to the order by the database, but the checkout (`src/routes/$slug.checkout.tsx`, `OrderSummaryCard`) never shows a tax line and its total (`grandTotal`) leaves it out. Aurora's orders: 34.000 shown, 37.400 on the order; 104.250 shown, 114.675 on the order. The card charge and a BenefitPay transfer follow the order's total, so the shopper pays more than the checkout said, and a booking's deposit or an advance previewed at checkout is a share of the smaller number. Fix: one tax rule for the checkout and the order builder (a pure twin run against the SQL, as the advance payment's is), a tax line in the summary, and the previews worked from the total with tax.
