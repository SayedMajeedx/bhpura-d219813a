---
name: giant-file-split
description: "Use when splitting a file over 1000 lines (roadmap Phase 5) into src/features/<domain>/{lib,hooks,components}. The method used for inventory, orders, product page, checkout, dashboard and the storefront home/shell (PRs #43-#61)."
---

# Splitting a giant file, behaviour-preserving

Current policy (owner-approved): the big splits are done. Split the remaining
files over 1000 lines **only when a feature needs to change them**, one
section per PR. Two data files (`src/features/settings/registry.ts`,
`src/lib/addons/addon-showcase-data.ts`) are not worth splitting. The ratchet
stops the others from growing.

## Order of work (one PR per step, route stays working after each)

1. **Pure logic first** → `src/features/<domain>/lib/*.ts` with unit tests.
   Move `useMemo` bodies, validation chains, payload builders, error-message
   mappings verbatim. Turn `toast.error(X); return;` chains into functions that
   return the message; turn `new Date()` / `Date.now()` into a `now` parameter
   (the route passes `new Date()`, so behaviour is unchanged).
2. **Hooks** → `src/features/<domain>/hooks/use-*.ts`: state + effects + queries
   that belong together, moved verbatim. Keep hook-call order legal: every hook
   before any early `return`. Add setters to dependency arrays when ESLint asks
   (stable `useState` setters, no behaviour change).
3. **Components** → `src/features/<domain>/components/*.tsx`: self-contained JSX
   sections, verbatim. Type props from their source:
   `ReturnType<typeof useX>["name"]`, `DashboardData["ordersQ"]`, etc., so the
   types follow the hooks. Keep conditions (`{x && (…)}`) in the route and move
   the inner element.

Tools: `scripts/refactor-tools/` (see its README), especially `extract_lib.py`,
`frag_extract.py`, `drop_props.py`, `rm_imports.py`, and
`examples/split_checkout_sections.py`.

## Rules

- **No behaviour change.** Found bugs go to `docs/bug-backlog.md` (where,
  problem, effect, fix) and into the PR description, not into the refactor.
- New files ≤ 600 lines; files over 1000 may only shrink. When a file drops
  under 1000, remove it from `GIANT_FILES_BUDGETS` and lower `filesOver1000` in
  `tests/maintainability-ratchet.test.ts`; otherwise lower its budget to the new
  size.
- No new `eslint-disable`, no new `any`/`as never` (the ratchet counts them).
- Storefront feature slices must stay inside the storefront data-layer lint
  rule (`eslint.config.js` lists `src/features/{storefront-home,product-page,
checkout,storefront-shell}/**`); add new storefront slices there.
- **Source-string tests** (`readFileSync` + `toContain`) will break when code
  moves. Add a per-file helper that joins the route with the feature files
  (`checkoutSource()`, `dashboardSource()`, `homeSource()`, `shellSource()`)
  and use it; never add `readFileSync` to a test file that did not have it.
  Tests that relied on the order of text inside one file
  (`indexOf("function A") < indexOf("function B")`, slicing from a function
  name) must read the specific component file instead, and folder names can
  make string searches match import paths (the `storefront-shell` case).
- A browser (Playwright) test is the safety net for UI splits. Storefront
  flows have `tests/checkout.spec.ts` and `tests/product-page-cart.spec.ts`
  (write-guarded via `tests/helpers/storefront-e2e.ts`). Admin screens have
  none: be extra careful there, or add one first.

## Verify

`npx tsc --noEmit`, `npx eslint <files>`, `npm run check`, then CI (Playwright
runs only in CI; it cannot start the dev server on the owner's Windows
machine). Report line counts before/after and bugs found.
