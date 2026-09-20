# Handoff Prompt — Boutq OS: Storefront 2.0 + Settings — final verification & release pass

Copy everything below the line into a new AI-assistant session opened at the repository root.

---

You are a senior full-stack engineer + QA lead working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — TanStack Start + React 19 + Supabase + Cloudflare Workers). Work directly in this checkout.

## Context — read this first

Two plans were executed and then reviewed:

- `docs/settings-and-brand-wizard-refinement-plan.md` (settings restructure, brand wizard, registry)
- `docs/storefront-2-premium-upgrade-plan.md` (Storefront 2.0)

All of that work lives on **one linear chain of 12 commits** ending at branch **`feat/storefront-v2-motion`** (pushed to origin). The chain is based on `feat/vertical-categories-stock-tailoring` (which is itself 42 commits ahead of `main` and not merged). The last three commits (`04319e0a`, `685d1d56`, `a06dbb66`) are a review fix pass; read their messages — they describe exactly what was broken and repaired. Do **not** re-do that work.

Ground truth on `feat/storefront-v2-motion` at `a06dbb66`:

- `npx tsc --noEmit` → 0 errors. `npx vite build` → client + server build green.
- `npx vitest run` → **7 files / 13 tests failing, all pre-existing on the base branch** (`addon-registry`, `design-system-guardrails` budgets, `fit-passport`, `food-sweets-variants-refinement`, `formatting.behavior`, `storefront-performance-guardrails` fonts, `vanilla-core-guard` on files outside this work). Any _new_ failure is yours.
- `npx eslint .` → 0 non-prettier errors. **55 files outside this work are unformatted** on the base branch, so `npm run format:check` (first CI step) is red before you start.
- `npm run db:migrations:check` → passes (249 migrations). The two new migrations (`20260924100000_brand_wizard_provisioning.sql`, `20260925100000_storefront_v2.sql`) have **not** been applied to any database yet.
- The Vite dev server could not be verified in the reviewer's environment (it never bound port 5173 in that sandbox even after the build fix). Treat "does the app actually run" as unproven until you prove it.

Load these repo skills before starting: `.agents/rules/AGENTS.md`, `.agents/skills/handoff-plan-execution/SKILL.md`, `.agents/skills/storefront-premium-design-system/SKILL.md`, `.agents/skills/storefront-seo-performance-a11y/SKILL.md`, `.agents/skills/settings-registry-single-source/SKILL.md`, plus the existing `rtl-arabic-consistency`, `refactor-safety`, `migration-hygiene`, `test-quality-gate`, `multi-tenant-security`.

## Your mission — in this order, one PR per numbered block

### 1. Prove the app runs (blocking everything else)

1. `npm run dev` from a clean shell. If it does not serve `http://localhost:5173/pura` within 60 s, diagnose (port in use, `.env` values, route-tree generation, Windows path with a space in `C:\Users\TCIG-Sayeed Majeed\…`) and fix the root cause — do not work around it with a different command. Record the cause in the PR.
2. With the server up, open and screenshot at 375 px and 1280 px, Arabic and English:
   - `/pura` (v1 look — must be visually identical to production `https://boutq.store/pura`),
   - `/admin/b/pura/settings` — every one of the 5 tabs, expand every group in both **basic** and **advanced** level. Every control from `src/features/settings/registry.ts` with `owner: "settings"` must be visible somewhere. Change one value per group, save, reload, confirm in the DB and on `/pura`. Then open the page and save **without** changing anything: `business_settings` must differ only in `updated_at`.
   - `/admin/brands` → "New brand" wizard end to end with a colourful logo (test brand, vertical `abayas`): confirm the palette extraction preview, then that the created brand has `store_vertical = 'abayas'`, `storefront_design_version = 2`, derived palette columns filled, starter add-ons installed (`fashion-core`, `size-guides`, `fit-passport`, `made-to-order`, `abaya-pack`), default categories created, and the white-label app step (if enabled) runs **after** logo + palette. Delete the test brand afterwards.
3. Apply the two migrations to a **staging** database (never production first). Verify: no existing brand's `primary_color` (invoice) or `font_family` changed unless it was already identical to the storefront value; `brand_public_settings` still returns 143+ columns; `newsletter_subscribers` / `back_in_stock_requests` reject anonymous inserts (RLS) and accept writes through the server functions.

### 2. Storefront 2.0 visual QA on Pura (behind the flag)

1. In staging set `storefront_design_version = 2` for Pura (via the "Upgrade design" card in Settings → Storefront, which is reversible).
2. Walk the agency checklist in `.agents/skills/storefront-premium-design-system/SKILL.md` on home, category, product, search overlay, quick view, cart, checkout, custom-order — 375/768/1280/1536, ar/en, with the hero video **blocked** in DevTools (poster/fallback must look intentional, H1 ≥ 28 px on mobile), keyboard-only navigation, and `prefers-reduced-motion: reduce` (no motion at all).
3. Fix what you find. Expect issues in the files that were converted mechanically during the review: `QuickViewModal`, `CategoryFilters`, `SearchOverlay`, `ProductAccordion`, `FooterV2`, `NewsletterForm`, `BundleOffer`, `QuickAddPopover`, `custom-order`, brand-wizard steps — raw `<button>`s became `<Button variant="ghost" size="sm" className="h-auto …">`; check padding, hover backgrounds (round swatches/dots must keep `hover:bg-transparent`), RTL alignment, and 44 px touch targets.
4. Run Lighthouse (mobile preset) on `/pura` for v1 and v2; both must meet the budget in `.agents/skills/storefront-seo-performance-a11y/SKILL.md` (LCP ≤ 2.5 s, CLS ≤ 0.05, Performance ≥ 85, SEO/a11y/BP ≥ 95). Validate a product page and a category page in Google's Rich Results Test. Share a product link in WhatsApp and confirm the OG image is the product photo.
5. Only when the owner signs off on the screenshots: flip Pura to v2 in production. Otherwise leave it at 1.

### 3. Missing Playwright coverage (the plans required it; only `tests/settings-tabs.spec.ts` exists)

Add, in the existing style of `tests/mobile-ux-audit.spec.ts` / `tests/desktop-audit.spec.ts`:

- `tests/hero-fallback.spec.ts` — block `**/*.mp4`, assert the hero has a visible H1 (font-size ≥ 28 px at 375 px) and is not a single flat colour.
- `tests/pdp-v2.spec.ts` — accordion keyboard operation, image zoom, quick add on 1280 px, notify-me form appears for a sold-out variant.
- `tests/motion-a11y.spec.ts` — with `reducedMotion: 'reduce'` no element has a running transition/animation; CLS ≤ 0.05.
- `tests/quick-view.spec.ts` — open from the grid, add to cart, cart count increments.
- `tests/brand-wizard.spec.ts` — super-admin creates a brand with a logo fixture; assert the pipeline steps reach "success" and the summary shows the extracted palette.

Do not weaken any existing threshold.

### 4. Repo hygiene (separate PR, base-branch scope only)

- `npx prettier --write .` on the 55 pre-existing unformatted files so `npm run format:check` is green. No other changes in that PR.
- The 13 pre-existing failing tests: open one issue per file with the failing assertion and the commit that introduced it (`git log -S`). Do not fix them in this pass unless the fix is a one-liner and obviously correct.

## Rules

- Never commit `storefront_design_version = 2` for an existing brand in a migration; it is a per-brand runtime setting.
- Never add a dependency. Never touch cart/checkout/stock/pricing logic. Never delete or rename a column.
- Every PR description: baseline numbers before/after, files touched, screenshots (375 + 1280, ar + en), deviations from this prompt and why. Follow `.agents/skills/handoff-plan-execution/SKILL.md` for PR structure.
- Branch names: `qa/app-runs-and-migrations`, `qa/storefront-v2-visual`, `test/storefront-v2-playwright`, `chore/format-base-branch`. Base every branch on `feat/storefront-v2-motion`.
- Suggested merge order afterwards: `feat/storefront-v2-motion` → `feat/vertical-categories-stock-tailoring` → `main` as a single stacked PR each; the seven intermediate branches are kept on origin only for history.
