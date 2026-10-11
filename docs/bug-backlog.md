# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #35 is fixed.

## #38 A variant can point at a picture that no longer exists

Found 2026-10-12 (order 1101 on Pura showed a broken image). The size variant of "Abaya | Marjan" has `product_variants.image_url` = `…/product/dad779ae-6487-4255-897d-46a4ca80690d.jpg`, which returns 404 from the media host; the product's own gallery pictures load. It is the only one of the six variants that carry their own picture.

Not known: what deleted the file while the variant still pointed at it (replacing or removing a gallery picture in the product editor, or the media re-optimizer, are the candidates). The order line now falls back to the product's picture (`LineThumbnail`), which hides the symptom there only.

To fix: find the path that removes a media object, and either refuse to remove a picture a variant still uses or clear `image_url` on those variants in the same save; add a test. Then re-pick the picture on that variant (a data change the owner makes in the product editor).
