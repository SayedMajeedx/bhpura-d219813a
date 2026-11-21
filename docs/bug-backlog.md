# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #52 is fixed.

## 53. "Cormorant Garamond" is served from a Canela trial file

Found 2026-11-21 while choosing faces for the gift card font picker. `src/fonts.css` declares the family "Cormorant Garamond" from `public/fonts/english-font.woff2`, and `selfHostedFontPreloads` in `src/lib/typography.ts` preloads that file, but the file's own name table says `CanelaTextTrial-RegularNo2Italic`: a commercial typeface's trial cut, not the open Cormorant Garamond. A store that picks "Cormorant Garamond" in Typography gets Canela's trial italic on its storefront, which its trial licence does not cover. Fix: replace the file with Cormorant Garamond (OFL) cut like the other self-hosted faces, with its licence under `public/fonts/licenses/`, or drop the family from the pickers. The card font picker never offers it.
