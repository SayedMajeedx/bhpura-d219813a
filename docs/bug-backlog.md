# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

## Content studio (`src/features/content-studio/`)

### 34. The stage shows the base price when a variant is chosen

Found while splitting the content studio route (Phase 0 of the Content Studio 2.0 plan).

- **Where**: `components/StudioPreview.tsx`, the price line of the text card: `showPrice && selected?.base_price ? … Number(selected.base_price).toFixed(3)`.
- **Problem**: the stage always prints the product's base price, while the caption (`use-studio-caption.ts`) and the variant picker use the chosen variant's `selling_price` (`effectivePrice`). A product with no base price never shows a price at all, even with a priced variant selected.
- **Effect**: a merchant who picks a variant that sells for a different price (or is on sale) exports a post showing the wrong price, while the caption beside it is right.
- **Fix**: print `effectivePrice` (hide the line only when it is null), and cover it in `tests/content-studio-screen.test.tsx` by choosing the 39.000 variant.
