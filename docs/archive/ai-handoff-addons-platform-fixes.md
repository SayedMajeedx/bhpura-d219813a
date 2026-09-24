# Handoff Prompt — Boutq OS: Add-ons Platform Fixes (F-1 → F-5)

Copy everything below the line into a new AI-assistant session opened at the repository root.

---

You are a senior full-stack engineer working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — multi-tenant SaaS e-commerce OS; TanStack Start + React 19 + Supabase (Postgres/RLS/RPC) + Cloudflare Workers; Expo mobile apps under `apps/`). Work directly in this checkout.

**Your mission:** the "Vanilla Core + Add-ons" platform was implemented (PRs #14–#17, plan `docs/addons-platform-implementation-plan.md`), but an audit found that most add-ons do not actually work and the core still behaves like an abaya store. Execute **`docs/addons-platform-audit-2026-09-14.md`** exactly, as **five sequential PRs (F-1 → F-5)**. The audit is written in Arabic with English code; it is the single source of truth: every finding has file:line evidence and the exact fix. Read it **in full** before touching anything. This prompt tells you how to work; the audit tells you what to fix.

The owner's three complaints you must make disappear: (1) most add-ons "don't work" after install; (2) changing the store activity in Settings does not change the recommended add-ons or install anything; (3) the inventory/product editor still shows abaya-specific things (Fit Passport presets, abaya sizing templates, fabric fields) regardless of activity.

## How the audit is organized

| Section | Content                                                                                                                                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §0      | Executive summary — what works, what doesn't, the structural diagnosis ("platform built, consumption never wired").                                                                                                                                                         |
| §1      | **P0** blockers: seeds query a non-existent `brands.owner_id`; seeds swallow insert errors then get marked done; shared react-query key with 4 different `select` shapes; Settings card writes legacy `store_modules` instead of add-ons; activity change installs nothing. |
| §2      | **P1** contributions declared in manifests with **zero consumers** (vocabulary, customFieldPresets, sizingPresetOrder, readinessChecks, trustBadgeSuggestions, aiContext, productionStages, axis `.visible`).                                                               |
| §3      | **P1** inventory page still abaya (`vertical === "fashion"` checks, ungated Passport presets, abaya sizing pills, `abayas` transitional fallback).                                                                                                                          |
| §4      | **P1** incomplete extraction (product page / order detail still contain fashion logic; guard test only checks the word "عباية").                                                                                                                                            |
| §5      | **P1** platform function hardening (`addons.functions.ts`): conflicts, safe settings patch, event insert errors, upgrade seed keys, starter-pack validation, anon RLS leak of `settings`, friendly error codes.                                                             |
| §6      | **P2** quality: stale generated types, phantom preset/badge ids, duplicated sources, missing seed/consumption tests.                                                                                                                                                        |
| §7      | PR plan F-1 → F-5 with "Done when".                                                                                                                                                                                                                                         |
| §8      | Definition of Done.                                                                                                                                                                                                                                                         |

## Ground truth as of 2026-09-14 (re-verify before relying on it)

- `main` @ `6a4490fe` (`fix(size-guides): eliminate false size 60 fallback…`). Working tree clean except the untracked audit doc.
- Verified baseline on `main` @ `6a4490fe` — **CI is currently red**: `npm run typecheck` → 0 errors; `npm run format:check` → **fails on 9 files** (unformatted code from the last PRs; `npx prettier --write .` fixes them); `npm run lint` → **70 errors** (all `prettier/prettier`, same root cause) + 53 warnings; `npx vitest run` → **128 files, 787 tests, 1 failing**: `tests/design-system-guardrails.test.ts` › "keeps text below the 12px legibility floor within budget" (expected 0, got 3) caused by `src/addons/size-guides/components/storefront/size-guide/SizeRecommender.tsx:112,124,164` using `text-[11px]`/`text-[10px]`. **Your first commit on the F-1 branch is a `chore(ci): restore green gate` commit**: run `npx prettier --write .`, replace the three `text-[10px]`/`text-[11px]` with `text-xs` (do not touch the test), re-run the full gate and record the resulting green numbers as your baseline. Do not start any audit work until the gate is green.
- Latest migrations: `20260919100000_brand_addons_platform.sql` (brand_addons/policies/events + RPC `get_storefront_page_data` returning `addons`), `20260920100000_addon_store_and_policies.sql`. Any new migration must be timestamped after these. Latest RPC definitions: `grep -ln "FUNCTION public.<name>" supabase/migrations/*.sql | tail -1`.
- CI (`.github/workflows/ci.yml`) is Node 20; local is Node 24. LF line endings. Prettier `printWidth 100`.
- Key platform files: `src/lib/addons/{addon-types,addon-registry,addon-compat,addon-presets,addons.functions}.ts`, `src/addons/registry.ts`, `src/addons/<id>/manifest.ts` (11 add-ons), `src/components/addons/{AddonSlot,AddonsProvider,AddonErrorBoundary,AddonStore}.tsx`, `src/hooks/{use-brand-addons,use-store-profile}.ts`, `src/components/settings/StoreProfileCard.tsx`, `src/routes/_authenticated/admin.b.$slug.addons.tsx`, `src/lib/store-vocabulary.ts`, `src/lib/store-profile.server.ts`.
- Giant files you will touch (do not grow them; move code out, never in): `admin.b.$slug.inventory.tsx` (~7.4k lines), `admin.b.$slug.settings.tsx` (~7.2k), `admin.b.$slug.orders.$id.tsx` (~5.4k), `$slug.product.$id.tsx` (~2.5k).
- Real schema facts you must respect: `brands` has `created_by` (no `owner_id`); `customization_options.user_id` is `NOT NULL REFERENCES auth.users(id)`; `size_guides.base_unit` is `CHECK (base_unit IN ('cm','in','none'))`; `SIZING_PRESETS` ids are exactly `abaya_gulf, abaya_extended, apparel_standard, apparel_compact, numbered_1_5, shoes_women, shoes_men, free_size` (`src/lib/variant-sku-utils.ts:161-215`); trust-badge library ids live in `src/lib/trust-badges.ts`.
- `src/integrations/supabase/types.ts` is stale (no `brand_addons`, `size_guides`, `platform_addon_policies`) — regenerate in F-5 only, not earlier.

## Owner decisions (already made — apply, do not re-open)

1. Merchants install/disable/remove add-ons themselves; super-admin controls availability via `platform_addon_policies`.
2. Uninstall never deletes data; purge is a separate explicit action.
3. All add-ons are free; no entitlement gating.
4. UI naming is "الإضافات / Add-ons".
5. `abayas` and `fashion` are separate activities; existing brands are `abayas`. **Existing abaya brands must see everything they saw before v2**, including "نوع القماش / المناسبة" and the fabric field in the variant generator (currently hidden by the `vertical === "fashion"` bug — restore them).
6. `store_modules` (jsonb) is deprecated: never write it again; `brand_addons` is the single source of truth. Do not drop the column in this work.

## Non-negotiable rules

1. **Never edit an existing file under `supabase/migrations/`.** Add new `YYYYMMDDHHMMSS_description.sql` files; run `npm run db:migrations:check`. Copy RPCs/views whole from their latest definition; re-apply `security_invoker=false` + grants on any redefined public view.
2. **Do not edit `package.json`.**
3. **Never weaken tests.** If a source-string test reads a file you move, update the path with the same assertions and say so in the commit. New logic gets **behavioral** tests (call the function, assert the result).
4. **Seeds are the top priority and must be provably correct**: every seed checks `error` and throws; the seed `db` passed to add-ons is a wrapper that throws on error; `tests/addon-seeds.test.ts` runs every seed of every manifest against a fake `db` that records `from(table).insert/update/select(columns)` calls and asserts every table/column exists in a schema list you derive from `supabase/migrations` (write a small extractor) — this test would have caught both P0-1 and P0-2 and must exist before F-1 merges.
5. **One react-query key = one data shape.** Fix P0-3 by giving each `select` shape its own key; add a source test that fails if `queryKeys.brand.businessSettings(` is used with a `select` other than `"*"`.
6. **Contributions must have consumers.** Add `tests/addon-contributions-consumed.test.ts`: for every key of `AddonContributions` in `addon-types.ts`, at least one file outside `src/addons/**` and `src/lib/addons/**` must reference the matching `…From(`/hook (e.g. `vocabularyFrom`, `customFieldPresetsFrom`, `readinessChecksFrom`). Either implement the consumer or delete the contribution kind — never leave a declared-but-dead contribution.
7. **Registry validation must reject phantom references**: `validateRegistry()` fails on unknown sizing preset ids, unknown trust badge ids, unknown `SlotPlacement`, and on any `settingsPatchOnInstall` key that is not a `business_settings` column.
8. **Zero behavior change for existing abaya brands**, except restoring the two regressions in decision 5. Each PR description carries a regression proof (product editor, product page, account tabs, order detail, settings) — screenshots for F-3 and F-4.
9. **Vanilla core**: after F-4 the guard test uses the full regex `/عباي|abaya|الخياط|للخياط|Sent to Tailor|Fit Passport|passport_|تفصيل/i` over `src/{components,routes,lib,config}` with an explicit short allow-list (`store-profile.ts` activity labels, `variant-sku-utils.ts` preset data, `trust-badges.ts` library, the two thin add-on route files). No file outside `src/addons/**` imports `@/addons/*` except through `src/lib/addons/addon-registry.ts`; `src/lib/addons/addon-presets.ts` must stop re-exporting fit-passport internals to the core (move consumers behind slots/contributions).
10. **Design-system guardrails**: no `text-[10px]`/`text-[11px]`, no `border-border/50`, no raw `<button>` (use `Button`), no hex in `className`. **i18n**: every string Arabic + English; RTL-safe. Every admin page renders exactly one `main h1` (`OsPageHeader`).
11. **User-facing errors**: server functions throw stable codes (`ADDON_DEPRECATED`, `ADDON_NOT_AVAILABLE_FOR_BRAND`, `ADDON_CONFLICT`, `CANNOT_REMOVE_HAS_DEPENDENTS`, `CANNOT_DISABLE_HAS_DEPENDENTS`, `CANNOT_ENABLE_MISSING_DEPENDENCIES`, `SEED_FAILED`, `INVALID_STARTER_SELECTION`); `AddonStore` maps each to a bilingual message and logs technical details to `console.error`. Never show a raw Postgres message to a merchant.
12. **Opportunistic decomposition**: new UI goes into new files (`src/components/addons/*`, `src/addons/<id>/components/*`, `src/components/settings/*`). In giant files only delete/replace blocks and insert `<AddonSlot …/>` or hook calls.
13. **Scope discipline**: exactly the audit's five PRs. No new add-ons, no billing, no dynamic loading.
14. **Git**: branch from up-to-date `main`; conventional commits; one PR per task; never push to `main`; never force-push. Verification gate before each PR (paste output): `npm run format:check && npm run typecheck && npm run lint && npx vitest run` (+ `npm run db:migrations:check` when a migration is added; `npm run build` for F-1 and F-3).
15. **Stop conditions** — stop and report: a pre-existing test fails; a fix would need an old migration edited; a schema fact above turns out wrong (report the real one); the seed test finds a table/column mismatch you cannot resolve from the audit; anything requiring a decision not listed above.
16. **Report per task**: (a) commands + results, (b) files changed with one line each, (c) decisions/alternatives, (d) skipped/uncertain, (e) manual-check results from the audit's §7 "Done when".

---

## Task F-1 — Seeds & install correctness (branch `fix/addon-seeds-and-install`) → PR F-1

Execute audit **§1 P0-1, P0-2** and **§5** fully:

- `src/lib/addons/seed-helpers.ts`: `resolveBrandOwnerUserId(db, brandId)` (`brands.created_by` → fallback `business_settings.user_id` → `null` ⇒ skip inserting rows that need a user; never a zero UUID) and `withThrowOnError(db)` wrapper used for `AddonSeedContext.db`.
- Fix all seeds in `src/addons/{food-beverage,gifts,jewelry,print-stamps,beauty-perfume,abaya-pack,digital-products}/manifest.ts`: check every `error`; jewelry ring guide uses a valid `base_unit` (choose the audit's option: `'none'` with textual values, or add a migration extending the CHECK to `'mm'` and `convertMeasurement` mm↔cm — pick one, state why).
- `addons.functions.ts`: conflicts check for every id in `toInstall`; policy check for dependencies too; `settingsPatchOnInstall` applied only when the current value equals the original default and recorded as `patch:<key>` in `seeded_keys`; pass the brand/user language to seeds; check `brand_addon_events` insert errors; record upgrade seeds as `upgrade:<toVersion>:<key>`; validate `selectedAddonIds ⊆ required ∪ suggested` in `installStarterPack`; stable error codes (rule 11).
- Migration: new view `brand_public_addons(brand_id, addon_id, version, public_settings)` for anon; remove the anon row policy on `brand_addons`; `get_storefront_page_data` reads from the view (copy latest definition whole).
- Tests: `tests/addon-seeds.test.ts` (rule 4), `tests/addon-registry.test.ts` extended per rule 7, idempotency test (install twice ⇒ no duplicate rows/categories/options), error-code mapping test for `AddonStore`.

**Manual verification (record in PR):** on a fresh `general` brand install all seven packs one by one from the Add-ons page — every install succeeds first time and its data appears (perfume categories, gift-wrap option, ring size guide, food extras…); installing again creates no duplicates; a deliberately broken seed (temporary local edit) surfaces a bilingual error and is **not** recorded in `seeded_keys`.

**Done when**: PR F-1 green, all seven packs installable, `npm run build` passes.

---

## Task F-2 — Single source of truth for activity & modules (branch `fix/store-profile-single-source`) → PR F-2

Execute audit **§1 P0-3, P0-4, P0-5** and the `TRANSITIONAL_FALLBACK` item in **§3**:

- Query keys: `StoreProfileCard` and `admin.b.$slug.addons.tsx` stop using `queryKeys.brand.businessSettings`; the Add-ons page reads the vertical from `useAdminStoreProfile`; `useAdminStoreProfile` takes its `addons` from `useBrandAddons` (one fetch, one key) and its fallback becomes `general` with no modules while loading (expose `isLoading` and don't render vertical-conditional UI until loaded).
- `StoreProfileCard`: switches reflect `isInstalled(addons, id)` and call `installAddon` / `setAddonStatus` with the same dependency prompts as the store; delete every write of `store_modules`; "reset to activity defaults" installs `starterPackFor(vertical).required` and offers (unchecked by default) to disable add-ons not in the pack.
- Activity change flow: on saving a new `store_vertical`, show a "starter pack changed" dialog listing what will be installed and what is suggested for disabling (data kept), then run `installStarterPack` + `setAddonStatus`; the Add-ons page header shows "current activity: X — starter pack complete / n missing".
- Tests: source test for rule 5; behavioral tests for the "diff" helper that computes install/disable suggestions between two activities; a test that `StoreProfileCard.tsx` contains no `store_modules`.

**Manual verification:** brand on "abayas" → change to "beauty": dialog offers to install `beauty-perfume` and to disable the five fashion add-ons; accept install only → Add-ons page "recommended" shows the beauty pack immediately, switches in Settings reflect real installs, Settings → Business tab fields never go blank after saving.

**Done when**: PR F-2 green and the three checks above pass.

---

## Task F-3 — Consume every contribution + de-abaya the inventory (branch `feat/consume-addon-contributions`) → PR F-3

Execute audit **§2** and **§3** completely:

- `useVocabulary()` (admin from `useBrandAddons().addons`, storefront from `useStorefront().addons`) → `resolveVocabulary(DEFAULT_VOCABULARY, vocabularyFrom(rows))`; `status-labels.ts` functions accept an optional `vocab`; replace the hard-coded "الخياط/Tailor/تفصيل" labels in `orders.$id.tsx`, `orders.index.tsx`, `OrderUnifiedHeader.tsx`, `OrderItemsWorkflowCard.tsx`, `dashboard.tsx`, `content-studio.tsx`, `InvoicePreview.tsx`, `$slug.product.$id.tsx`, `$slug.checkout.tsx`. `fashion-core`'s vocabulary must reproduce today's strings verbatim (test).
- `customFieldPresets`: move the static presets into their packs (`fashion-core` gets the removed "Fashion" preset back; `print-stamps`, `gifts`, `jewelry` own theirs); inventory renders `customFieldPresetsFrom(addons)` only; Passport presets render only when `fit-passport` is installed and `fitProfiles` is `[]` otherwise.
- Sizing presets: replace `sizingPresetOrder` with `sizingPresets: SizingPreset[]` contributed by packs (abaya/apparel/shoes from fashion packs, 30/50/100 ml from beauty, S/M/L from food, ring sizes from jewelry); the core shows `[...addonPresets, numbered_1_5, free_size]`; delete `orderSizingPresetsForVertical`.
- `readinessChecksFrom(addons)` evaluated in a new server fn and merged into `evaluateStoreReadiness` (update `tests/store-readiness.test.ts`); `trustBadgeSuggestions` either implemented in `TrustBadgesEditor` ("suggested for your activity") with valid ids or removed from the type — decide and state why; `getBrandAiContext` injected into Copilot, Instagram importer, variant generator and translate prompts with the fashion phrasing replaced by neutral text and abaya heuristics gated on `fashion-core`/`abaya-pack`; `getOrderWorkflow(order, { productionStages })` gated on `made-to-order`; `resolveVariantAxis(...).visible` honored everywhere in the inventory (variant rows, variant editor, generator, bulk import).
- Inventory: replace `storeProfile.vertical === "fashion"` (`inventory.tsx` ≈3073, ≈4425; `content-studio.tsx` ≈1096-1099) with add-on checks so abaya brands get their fabric/occasion fields back and non-fashion brands never see them; move the fabric/occasion block into a `fashion-core` `admin.product.editorPanel` slot contribution.
- Tests: `tests/addon-contributions-consumed.test.ts` (rule 6), vocabulary tests (`general` has no خياط/Tailor/قماش), sizing preset composition tests, axis visibility tests.

**Manual verification (screenshots in PR):** three fresh brands via `/onboard` — عطور, مأكولات, عبايات — then "add product" in each: perfume shows Volume/Concentration, ml presets, no fabric, no Passport presets, no abaya templates; food shows S/M/L, kitchen vocabulary on an order ("قيد التحضير"), pickup readiness check; abaya shows exactly the pre-v2 editor including fabric type and occasion.

**Done when**: PR F-3 green, screenshots attached, `npm run build` passes.

---

## Task F-4 — Complete the extraction + hard guard (branch `refactor/complete-extraction`) → PR F-4

Execute audit **§4**:

- Move the remaining Fit Passport logic out of `$slug.product.$id.tsx` (lines ≈675-873, 1048-1074, 1137-1173, 1787-1974) into `src/addons/fit-passport/components/storefront/ProductFitPassportSection.tsx` rendered through the existing `storefront.product.afterOptions` slot (props: product, customFields, cfValues, setCfValues, onApplied/onRemoved, sizeState); workshop actions in `orders.$id.tsx` (≈1997, 2038) and `OrderUnifiedHeader.tsx` into `admin.order.headerActions` from `made-to-order`; tailoring copy (≈3351-3787) to vocabulary.
- `addon-presets.ts` stops re-exporting `@/addons/fit-passport/lib/*` to the core; whatever the core still needs becomes a contribution or moves into the add-on.
- Guard test upgraded to the full regex with the short allow-list (rule 9); update source-string tests whose targets moved (same assertions).

**Manual verification:** abaya brand — product page (size guide, Passport block, ready/custom toggle, workshop notes), account "مقاساتي", customer Passport card, order tailoring panel + workshop actions — pixel-identical to before; `general` brand shows none and the guard test passes.

**Done when**: PR F-4 green with screenshots.

---

## Task F-5 — Types, validation, cleanup (branch `chore/addon-platform-types-tests`) → PR F-5

Execute audit **§6**: regenerate `src/integrations/supabase/types.ts` (`supabase gen types` — if the CLI/DB is not reachable, stop and report; do not hand-edit); `validateRegistry` external-reference checks (rule 7) if not already done in F-1; make `platform_addon_policies.default_for_activities` override `starterPackFor` when set; derive "recommended" from a single source; remove duplicate `brand_addons` fetching.

**Done when**: PR F-5 green and the audit's §8 Definition of Done is fully checked.

---

## Final deliverable

`docs/handoff-report-addons-fixes-<date>.md` with: per-task status and PR links; verification-gate output per PR; regression proofs and screenshots (F-3, F-4); the seed test's schema extractor description; the list of contributions implemented vs removed and why; moved files and updated test paths; follow-ups (drop `store_modules`, any schema facts that differed from this prompt).
