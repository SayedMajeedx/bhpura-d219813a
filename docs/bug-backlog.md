# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #40 is fixed.

## 41. The delivery facts say "within Bahrain" for every store

`src/lib/delivery-info.ts` labels the store's home delivery fee "Delivery within Bahrain" / "التوصيل داخل البحرين" (`WORDS.*.home`) whatever country the store is in, so a Saudi or Kuwaiti store's product page ("Shipping & Returns") and the merchant's preview (`DeliveryShopperPreview`) name Bahrain. Found while building the content studio's How to Order (which writes "Delivery" and does not use the label). Fix: say "Delivery" alone, or name the store's own country; test it in `tests/delivery-info.test.ts`.
