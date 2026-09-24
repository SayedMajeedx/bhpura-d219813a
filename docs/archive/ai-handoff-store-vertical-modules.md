# Handoff Prompt — Boutq OS: Store Vertical & Modules (white-label de-fashioning) + Size Guide Studio

Copy everything below the line into a new AI-assistant session opened at the repository root.

---

You are a senior full-stack engineer working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — a multi-tenant SaaS e-commerce OS for GCC boutiques; TanStack Start + React 19 + Supabase (Postgres/RLS/RPC) + Cloudflare Workers; two Expo mobile apps under `apps/`). Work directly in this checkout.

**Your mission:** execute **`docs/store-vertical-modules-implementation-plan.md`** exactly, as **five sequential PRs** (one per phase). The plan is written in **Arabic** with English code — read it **in full** before touching anything. It is the single source of truth for scope, schema, file paths, line anchors, tests, and Definition of Done. This prompt tells you how to work; the plan tells you what to build.

Why this work exists: the platform was built for fashion/abaya boutiques, so fashion-only features (the abaya size guide, "Fit Passport" customer measurements, the "custom tailoring / send to tailor" flow, "fabric" axis, fashion-biased AI prompts, and onboarding that silently registers every brand as "Boutique & Fashion") are hard-coded for **every** brand. A perfume shop, café, print shop or gift store currently sees "Size Guide", "My fit", "Sent to Tailor". The plan turns these into **modules** driven by a per-brand **vertical** (`business_settings.store_vertical` + `store_modules`), makes the size guide a fully customizable **Size Guide Studio**, fixes a latent stock bug (any custom field ⇒ product treated as made-to-order ⇒ stock never deducted), and de-fashions platform copy — all with **zero behavior change for existing brands**.

## How the plan is organized (so you can navigate it)

| Section | Content                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §0      | Audit table: 35 numbered locations (`file:line`) where fashion is hard-coded, each tagged with its treatment/phase.                                                 |
| §1      | Architecture decisions + module definitions (`size_guide`, `fit_passport`, `made_to_order`) and vertical defaults.                                                  |
| Phase 1 | Migration, pure lib `src/lib/store-profile.ts`, admin hook, settings card, gating (point-by-point tables), mandatory onboarding vertical, platform copy (§1.9).     |
| Phase 2 | **Size Guide Studio**: `size_guides` table, `src/lib/size-guide.ts` + templates, admin route + editor, storefront panel/modal/inline/public page, size recommender. |
| Phase 3 | `products.is_made_to_order` explicit flag replacing the custom-fields inference (RPC + storefront + admin).                                                         |
| Phase 4 | Configurable fit profiles (`business_settings.fit_profiles`) + hiding the placeholder "قياسي/Standard" variant.                                                     |
| Phase 5 | Vocabulary map, AI prompt context by vertical, mobile app labels, super-admin, readiness, guard test.                                                               |
| Phase 6 | Optional SaaS gating — **skipped** (owner decision).                                                                                                                |
| §7      | PR table with per-PR manual verification.                                                                                                                           |
| §8      | Owner decisions already taken — **do not re-ask them**.                                                                                                             |
| §9      | Definition of Done for the whole feature.                                                                                                                           |

## Ground truth as of 2026-09-14 (verified — re-check line numbers before relying on them)

- `npx vitest run` → **113 files, 670 tests, all passing**. Any failing test after your change is caused by your change.
- `npm run typecheck` → **0 errors**.
- `npm run lint` → **0 errors, 38 warnings** (all `@typescript-eslint/no-unused-vars` / `react-hooks/exhaustive-deps`; warnings are allowed, errors are not — do not add new warnings). `npm run format:check` → passes. `npm run db:migrations:check` → passes (231 committed migrations). **Note:** the working tree also contains an **untracked** file `supabase/migrations/20260914100000_fix_engagement_views_and_inquiries_consistency.sql` that is **not part of this work** — do not include it in your branches; ask the owner what to do with it if it is still there when you start.
- CI (`.github/workflows/ci.yml`, "CI & Release Safety") runs on push/PR to `main`: formatting → typecheck → lint → unit tests; production build; migration validation; security audit; Playwright smoke tests (`tests/*.spec.ts`).
- CI runs on **Node 20**; local machine has Node 24. Keep everything Node-20 compatible. Committed files are LF (`core.autocrlf=false`). `.prettierrc`: `printWidth 100, semi, doubleQuotes, trailingComma all`. `.prettierignore` excludes `supabase/migrations/*.sql`.
- Largest files you will touch (lines): `src/routes/_authenticated/admin.b.$slug.inventory.tsx` ≈7,400; `admin.b.$slug.settings.tsx` ≈7,190; `admin.b.$slug.orders.$id.tsx` ≈5,400; `src/routes/$slug.product.$id.tsx` ≈2,460. **Do not grow them** — every new UI block goes into its own component file (see rule 11).
- All line anchors in the plan were verified against `main` at commit `f0e7399` on 2026-09-14.

### Existing patterns you must mirror (the plan points at each; here is the short list)

| Need                                   | Mirror this                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure helper lib + real unit tests      | `src/lib/storefront-mode.ts` + `tests/admin-storefront-mode.test.ts`, `tests/storefront-catalog-mode.test.ts`                                                                                                                                                                                                   |
| Self-contained settings card with save | `StorefrontModeCard` in `src/routes/_authenticated/admin.b.$slug.settings.tsx` (≈line 4156)                                                                                                                                                                                                                     |
| Adding columns to public settings      | `supabase/migrations/20260913100000_storefront_mode_catalog.sql` — `CREATE OR REPLACE VIEW public.brand_public_settings` (append-only), then `ALTER VIEW … SET (security_invoker = false)` + `GRANT SELECT … TO anon, authenticated`                                                                            |
| Storefront reads settings              | `get_storefront_page_data` does `to_jsonb(s.*) FROM public.brand_public_settings s` → `src/routes/$slug.route.tsx` loader maps fields (≈line 216) → `PublicSettings` in `src/lib/storefront-context.tsx` (≈line 167)                                                                                            |
| Admin reads a brand setting            | `adminStorefrontModeQuery` in `src/components/app-shell.tsx` (≈line 278) → `getAdminNavItems` in `src/config/admin-navigation.ts`                                                                                                                                                                               |
| New admin route + nav item             | `src/routes/_authenticated/admin.b.$slug.categories.tsx` + the `categories` nav item (`admin-navigation.ts` ≈line 256); page heading via `OsPageHeader` (renders the single `main h1` Playwright expects)                                                                                                       |
| RLS for a new brand-scoped table       | `supabase/migrations/20260806142421_fix_categories_public_read_policy.sql` (public read) and `20260905100000_remediate_phase4_categories_rls_and_counts.sql:12-15` (`is_admin() AND can_access_brand(brand_id)`)                                                                                                |
| `updated_at` trigger                   | `public.set_updated_at()` already exists (migration `20260705113344_…`)                                                                                                                                                                                                                                         |
| Bilingual inputs / image upload / CSV  | `src/components/bilingual-field.tsx`, `src/components/crop-upload-button.tsx` (+ `src/lib/image-crop-presets.ts` union type), `src/lib/csv-parser.ts` (`parseCSV` is comma-only — handle tabs yourself)                                                                                                         |
| Storefront analytics event             | `trackStorefrontEvent` + `StorefrontEvent` union in `src/lib/storefront-analytics.ts:1-2`                                                                                                                                                                                                                       |
| Latest RPC definitions                 | Always `grep -ln "FUNCTION public.<name>" supabase/migrations/*.sql \| tail -1` and copy the **whole** function; never edit the old file. Today: `place_storefront_order_internal_20260710` → `20260913100000_…`; `get_storefront_page_data` → `20260905140000_…` (after PR-2 it moves to your PR-2 migration). |

## Owner decisions (already made — apply them, do not re-open)

1. **Onboarding vertical selection is mandatory** — no default in the UI (`useState<StoreVertical | null>(null)`) and none on the server (`z.enum(STORE_VERTICALS)` without `.optional()`). Submit stays disabled until chosen.
2. **Existing brands stay exactly as they are** (backfilled to `fashion`). Only brands the super-admin explicitly registered as `Cafe / Restaurant` or `Digital store` (`brands.business_type`) become `food`/`digital`, and even those keep the modules on if they have real `customer_fit_passports` rows. Any brand can change vertical/modules later from Settings.
3. **Size guide becomes a full Size Guide Studio** (plan Phase 2, all 10 "world-class" criteria in §2.0) available to any brand that enables the `size_guide` module — with the current abaya table preserved for existing fashion brands as seeded data.
4. **Platform copy**: remove the word **Fashion** only, keep **Boutique** — e.g. `"Launch Your Boutique"` (exact strings in plan §1.9).
5. `made_to_order` defaults **on** for `jewelry` and `print`, off for other non-fashion verticals.
6. **No SaaS gating** — skip Phase 6 entirely.

## Non-negotiable rules (apply to every task)

1. **Never edit an existing file under `supabase/migrations/`.** Only add new files named `YYYYMMDDHHMMSS_description.sql` (use the names the plan proposes). Run `npm run db:migrations:check` after adding one. `CREATE OR REPLACE VIEW` only allows appending columns at the end; re-apply `security_invoker=false` + grants every time you redefine `brand_public_settings`. Never expose `admin_typography` on that view.
2. **Do not change the signature of `create_tenant_with_defaults`** (adding a defaulted parameter creates a Postgres overload, not a replacement). Set `store_vertical` from the server function after creation, as the plan describes.
3. **Do not edit `package.json`** or add dependencies.
4. **Zero behavior change for existing brands.** Every PR description must include a "regression proof" section: what an existing fashion brand sees before/after (screens listed in the plan's §7 manual checks), stated explicitly as "identical".
5. **Never delete, skip, `.only`, comment out, or weaken an assertion in a test.** Existing source-string tests (e.g. `tests/storefront-fit-passport.test.ts` asserts `value="fit"`, `<StorefrontFitPassport`, `t("مقاساتي", "My fit")` still exist in `$slug.account.tsx`) must stay green — gate with a wrapper, do not rename strings. If a test must change, keep its intent and say so in the commit message.
6. **Tests for new pure libs must be behavioral** (call the function, assert the result): `store-profile.ts`, `size-guide.ts` (incl. `recommendSize`, `parseSizeGuidePaste`, `resolveSizeGuideForProduct`), `size-guide-templates.ts`, `fit-passport.ts`, `store-vocabulary.ts`. Source-string tests are allowed **in addition**, for gating/wiring assertions, as the plan lists.
7. **Design-system guardrails**: no `text-[10px]`/`text-[11px]` (use `text-xs`); no `border-border/50`-style opacity borders; **no raw `<button>`** (use `Button` from `@/components/ui/button` — the current `SizeGuideModal.tsx` violates this; your rewrite must not); no hard-coded hex colors in `className`. `tests/design-system-guardrails.test.ts` enforces part of this.
8. **i18n**: follow the pattern of the file you edit (`lang === "ar" ? "…" : "…"` or `t("عربي", "English")`). Every user-visible string needs Arabic and English. RTL must work (tables in `overflow-x-auto`, `dir` aware).
9. **Playwright constraint**: every admin page must render **exactly one** `main h1` (use `OsPageHeader`). The new `/admin/b/$slug/size-guides` route must satisfy this even if it is not in the audited list yet.
10. **Deployment order for PR-1**: the storefront loader and admin hook keep a **transitional fallback** to `"fashion"` when `store_vertical` is null/undefined (plan §1.3/§1.4) so the code is safe to deploy before the migration is applied in production. Do not remove that fallback in this work; note it in the PR as a follow-up.
11. **Opportunistic decomposition, no giant-file growth**: new UI goes into new files — `src/components/settings/StoreProfileCard.tsx`, `src/components/storefront/size-guide/{SizeGuidePanel,SizeRecommender,SizeGuideModal,SizeGuideInline}.tsx`, `src/hooks/use-store-profile.ts`, `src/routes/_authenticated/admin.b.$slug.size-guides.tsx` (+ its editor components under `src/components/size-guides/`). In the four giant files, only wrap/condition existing blocks and pass props; do not refactor unrelated regions.
12. **Scope discipline**: build exactly what the plan's phase says. Do not start Phase N+1 before Phase N's PR is open and green. Do not build Phase 6. Do not rename DB values (`sent_to_tailor`, `order_type='tailoring'`, `location='custom'` stay).
13. **Re-verify every line number** cited in the plan before editing (`grep -n` the quoted code); numbers shift as you land PRs.
14. **Git**: branch from an up-to-date `main`; conventional commit messages (`feat:`, `fix:`, `test:`, `chore:`); one PR per task with a description containing: what changed and why, the regression-proof section, the verification output, decisions/alternatives, anything skipped. Never push to `main` directly. Never force-push.
15. **Verification gate after every task** (paste summarized output in the PR):
    ```bash
    npm run format:check && npm run typecheck && npm run lint && npx vitest run
    ```
    plus `npm run db:migrations:check` when you added a migration, and `npm run build` for PR-1 and PR-2.
16. **Stop conditions** — stop, do not work around, and report: a test fails that your change did not cause; a fix would require editing an existing migration or changing an RPC signature; a required table/column/function named in the plan does not exist in the repo; the transitional fallback would need to be removed to make something work; you lack permissions (git/GitHub).
17. **Report format at the end of each task**: (a) commands run and their result, (b) files changed with one line each on why, (c) decisions made and alternatives rejected, (d) anything skipped or uncertain, (e) the manual verification results from the plan's §7 row for that PR.

---

## Task 1 — Foundation, gating, mandatory onboarding, platform copy (branch `feat/store-profile-foundation`) → **PR-1**

Execute plan **Phase 1** completely (§1.1 → §1.9):

- Migration `20260915100000_store_vertical_and_modules.sql` (columns + constraints + backfill + Fit-Passport protection + view append + grants).
- `src/lib/store-profile.ts` exactly as specified (exports `STORE_VERTICALS`, `STORE_MODULES`, `VERTICAL_MODULE_DEFAULTS`, `VERTICAL_LABELS`, `MODULE_LABELS`, `normalizeVertical`, `normalizeModuleOverrides`, `resolveStoreModules`, `isModuleEnabled`, `legacyBusinessTypeToVertical`, `verticalToLegacyBusinessType`).
- `PublicSettings` fields + loader mapping + `useStoreModules()` in `storefront-context.tsx`.
- `src/hooks/use-store-profile.ts` + `queryKeys.brand.storeProfile` + replace `adminStorefrontModeQuery` in `app-shell.tsx`; add `storeModules?` to `GetNavItemsOptions`.
- `StoreProfileCard` mounted first in the Settings → Business tab.
- All gating rows in §1.6 (storefront + admin tables) — each one.
- Onboarding: mandatory vertical picker in `src/routes/onboard.tsx`; `storeVertical: z.enum(STORE_VERTICALS)` in `registerInstantTrial`; step 6b writes `business_settings.store_vertical`; tenant-request approval path maps via `legacyBusinessTypeToVertical`; `admin.super.requests.tsx` label.
- Platform copy table in §1.9 (five strings).
- `tests/store-profile.test.ts` with every case listed in §1.8 (behavioral + the listed source assertions, including the "no Fashion in those five files" check).

**Manual verification (record in PR):** the four checks in plan §7 row PR-1 — (a) existing fashion brand identical; (b) `/onboard` refuses submit without a vertical, a new "Beauty & Perfume" brand shows no size guide / no ready-vs-custom toggle / no "My fit" tab / no Passport card / no Passport presets; (c) switching that brand to "Fashion" in Settings brings everything back; (d) `/onboard` heading reads "Launch Your Boutique".

**Done when**: PR-1 is green, the four manual checks pass, and the PR description carries the regression proof and the transitional-fallback follow-up note.

---

## Task 2 — Size Guide Studio (branch `feat/size-guide-studio`) → **PR-2**

Execute plan **Phase 2** completely (§2.0 criteria → §2.5 tests). Non-negotiable specifics:

- Migration `20260916100000_size_guides.sql`: table with the exact column set/constraints in §2.1, unique partial index for one default per brand, `set_updated_at` trigger, `products.size_guide_id` + `products.size_guide_hidden`, `categories.size_guide_id`, RLS mirrored from `categories`, grants, the fashion-brand backfill row (data must equal the `abaya_gulf` template byte-for-byte in meaning — a test compares them), and the `get_storefront_page_data` redefinition adding `size_guide_id`/`size_guide_hidden` on products, `size_guide_id` on categories, and a top-level `size_guides` array.
- `src/lib/size-guide.ts` with the typed API in §2.2 (`normalizeSizeGuide`, `convertMeasurement`, `formatCell`, `resolveSizeGuideForProduct`, `parseSizeGuidePaste`, `recommendSize` with the documented algorithm and tolerance) and `src/lib/size-guide-templates.ts` with **all** templates listed in §2.0(3).
- Admin: new route `admin.b.$slug.size-guides.tsx` (two-pane list/editor, template gallery ordered by the brand's vertical, spreadsheet-like grid with paste, column kinds and `measurement_key`, unit switch with "convert existing values", how-to-measure steps + diagram upload via a new `sizeGuideDiagram` crop preset, placement/recommender/default/category-assignment tab, live preview using the same storefront panel). Nav item `size-guides` shown only when `storeModules?.size_guide` (extend `tests/admin-storefront-mode.test.ts`). Product editor: size guide selector (inherit / specific / hide). Category editor: default guide selector.
- Storefront: `StorefrontProvider` receives `catalog={{ sizeGuides, categories }}` from `bootstrapData`; new components under `src/components/storefront/size-guide/`; `SizeGuideModal.tsx` fully rewritten (no `DEFAULT_ABAYA_SIZES`, no raw `<button>`); product page resolves the guide, honors `placement`, feeds Fit Passport measurements to the recommender when `fit_passport` is on, wires `onSelectSize` to the real size pills; `view_size_guide` analytics event; public page `src/routes/$slug.size-guide.tsx` + footer link under the "help" group when a guide exists.
- Tests: `tests/size-guide.test.ts`, `tests/size-recommender.test.ts`, `tests/size-guide-templates.test.ts`, plus the source assertions in §2.5.

**Manual verification (record in PR):** existing fashion brand sees the same abaya table with the same numbers; a new jewelry brand creates a ring guide from the template, assigns it to a "Rings" category, and it appears only on that category's products; pasting a table from Google Sheets works; the recommender returns the documented results for the abaya sample inputs; `/{slug}/size-guide` renders; on mobile the table scrolls inside its container without horizontal page scroll; the new admin route renders exactly one `main h1`.

**Done when**: PR-2 is green and every item in the plan's §9 "Size Guide Studio" checklist line is demonstrably true.

---

## Task 3 — Explicit `is_made_to_order` flag (branch `fix/products-made-to-order-flag`) → **PR-3**

Execute plan **Phase 3** (§3.1 → §3.4):

- Migration `20260917100000_products_made_to_order_flag.sql`: column + backfill from non-empty `custom_fields`; redefine `get_storefront_page_data` (copy the **PR-2** version) adding `is_made_to_order`; redefine `place_storefront_order_internal_20260710` (copy from `20260913100000_…`) replacing the `v_is_tailoring` inference with `COALESCE(v_product.is_made_to_order, false)`.
- Admin product editor: always-visible "made to order (no stock deduction)" switch; auto-set `true` when a Passport preset is applied.
- Storefront: `select` fields, `product-card.tsx` OOS rule, `isTailoringActive` rule, admin order-detail detection via `location === "custom" || !variant_id` instead of the Arabic keyword.
- Note: the Public API `POST /api/v1/orders` inserts orders directly (does not call the RPC) — no change needed there; say so in the PR.

**Manual verification (mandatory):** product with stock 1 + a custom field + `is_made_to_order=false` → second storefront order fails with `INSUFFICIENT_STOCK`; flip to `true` → no deduction and `order_items.location='custom'`.

**Done when**: PR-3 is green and the stock test above is recorded.

---

## Task 4 — Configurable fit profiles + placeholder variant (branch `feat/fit-profiles-config`) → **PR-4**

Execute plan **Phase 4** (§4.1 → §4.3):

- Migration `20260918100000_fit_profiles_config.sql` (`business_settings.fit_profiles jsonb NULL` + view append + grants).
- Refactor `src/lib/fit-passport.ts` to the profile-parameterized API (`FASHION_FIT_PROFILES`, `resolveFitProfiles`, all functions taking `profiles` first) — **backward compatible**: `null` config ⇒ the exact current abaya/dress behavior, legacy `height`/`abaya_length` normalization preserved. Update every caller listed in §4.1 (Storefront/Customer Fit Passport components, product page detection, order detail customizer, inventory presets generated from profiles). Profile editor inside `StoreProfileCard` when `fit_passport` is on, with the "Fashion template" button.
- Placeholder variant: `PLACEHOLDER_SIZE_VALUES`, `isPlaceholderVariant`, `displayVariantParts` in `variant-sku-utils.ts`; use them at the inventory creation sites and in product page / checkout / invoice / thermal print / cart sharing display. DB data unchanged.
- `tests/fit-passport.test.ts` (backward-compat cases + a custom "ring" profile feeding `recommendSize`) and placeholder-variant tests.

**Manual verification:** an existing customer's saved abaya/dress Passport loads, edits and saves unchanged; a single-variant product no longer shows "Size / Option: Standard" nor "قياسي" in cart/invoice.

**Done when**: PR-4 is green and Passport data round-trips without migration.

---

## Task 5 — Vocabulary, AI context, mobile, super-admin, guard test (branch `feat/store-vocabulary-ai-context`) → **PR-5**

Execute plan **Phase 5** (§5.1 → §5.5):

- `src/lib/store-vocabulary.ts` (+ small migration adding `business_settings.store_vocabulary jsonb NOT NULL DEFAULT '{}'` to the view); `fashion` vocabulary must reproduce today's strings **verbatim** (a test asserts "تم الإرسال للخياط" / "Sent to Tailor"); `general` must contain no خياط/Tailor/قماش.
- Replace every location in the §0 table tagged "مفردات" (status labels with an optional `vocab` param defaulting to fashion so existing callers/tests stay green; orders list/detail/header/workflow card; dashboard; product page notes; checkout error; invoice fallback terms; content studio; i18n examples; category/packaging/settings sample copy; `getOrderTypeLabel`).
- `src/lib/store-profile.server.ts#getBrandAiContext` and inject it into Copilot, Instagram importer, variant generator, translate prompts; fashion-only heuristics (abaya price exclusion, even-size priority) gated on `vertical === "fashion"`.
- Mobile app: `apps/boutq-os-mobile/src/lib/store-vocabulary.ts` (standalone copy — the app cannot import from root `src/`), read `store_vertical` in `auth.tsx`, replace the listed labels.
- Super-admin: vertical column + `StoreProfileCard` on the brand detail; readiness checklist item "add a size guide" when `size_guide` is on and none exists (update `tests/store-readiness.test.ts`).
- Guard test `tests/no-hardcoded-fashion.test.ts` scanning `src/**/*.{ts,tsx}` minus the explicit allow-list in §5.5.

**Done when**: PR-5 is green, the guard test passes, and a `general` brand shows no fashion vocabulary anywhere (admin, storefront, invoice, mobile).

---

## Final deliverable

A single `docs/handoff-report-store-vertical-modules-<date>.md` with: per-task status and PR links; the verification-gate output per PR; the regression-proof statements; the manual-check results from each §7 row; the list of line anchors that had shifted from the plan and where they moved; decisions/alternatives; and the transitional-fallback follow-up (remove `?? "fashion"` after the PR-1 migration is applied in production).
