# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #40 is fixed.

## 41. Every store's review reward is the code THANKU10

`submit_public_order_review` returns the fixed code `'THANKU10'` (and `order_reviews.reward_code` defaults to it), and the review page (`src/routes/review.$token.tsx`) promises "10%" in fixed text and falls back to `THANKU10`. Only Pura has a promo code named THANKU10 (checked 2026-10-22, read-only), so the first review in any other store hands the customer a code that does not exist, and a store that wants another discount cannot set one. Found while adding reviews to product pages (migration `20261022100000` keeps the function's return as it was). Fix: the store's own reward (a setting naming one of its promo codes, or none), the page saying what that code takes off (`promoOffer` in `src/features/content-studio/lib/moments.ts` writes one), and a test in a real Postgres.
