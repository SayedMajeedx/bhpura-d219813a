# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #38 is fixed.

## 39. The expenses list takes its currency from the first expense

- **Where:** `src/features/expenses/components/ExpensesPage.tsx`, `const currency = list[0]?.currency ?? "BHD";` (and `ExpenseDialog`'s form starts with `currency: expense?.currency ?? "BHD"`).
- **Problem:** the page's amounts (the profit and loss strip, the list) are written in the currency of whichever expense comes first, and in BHD when there is none; a new expense is saved in BHD whatever the store's currency is.
- **Effect:** none today (every store is BHD). A store in another currency would see its revenue and cost of goods labelled BHD until it had an expense, and its new expenses saved as BHD.
- **Fix:** `useStoreCurrency(brandId)` for the page and for a new expense's default (the rule in AGENTS.md section 7).

## 40. Two calculations on the expenses page whose results are thrown away

- **Where:** `src/features/expenses/components/ExpensesPage.tsx`: `useMemo(() => presetRange("month"), []);` and `useMemo(() => filteredList.reduce(...), [filteredList]);`.
- **Problem:** both results are discarded (nothing is assigned).
- **Effect:** none on what the page shows; a little wasted work on every change of the list.
- **Fix:** delete both lines.
