# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #49 is fixed.

## #50 The cart drawer's quantity buttons are named in English on an Arabic page

Found 2026-10-27 while trying the automatic offers on Pura's storefront. `src/components/storefront/StorefrontCartDrawer.tsx` names the quantity buttons `aria-label="decrease"` and `aria-label="increase"` whatever the page's language, so a screen reader reads English on an Arabic store, and the name does not say which line it changes (AGENTS.md: a button that shows only an icon says what it acts on, in the reader's language). Fix: `t("تقليل كمية …", "Decrease … quantity")` with the line's name, and a test in `tests/admin-accessible-names.test.tsx`'s style for the drawer.
