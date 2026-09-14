# Handoff Prompt — Boutq OS: Vanilla Core + Add-ons Platform (v2)

Copy everything below the line into a new AI-assistant session opened at the repository root. **Start this only after the v1 PRs (Size Guide Studio, `is_made_to_order`, fit profiles) are merged — see "Preconditions".**

---

You are a senior full-stack engineer working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — a multi-tenant SaaS e-commerce OS for GCC boutiques; TanStack Start + React 19 + Supabase (Postgres/RLS/RPC) + Cloudflare Workers; two Expo mobile apps under `apps/`). Work directly in this checkout.

**Your mission:** execute **`docs/addons-platform-implementation-plan.md`** (v2) exactly, as **four sequential PRs** (v2-A → v2-D; v2-E is optional and skipped). The plan is written in **Arabic** with English code — read it **in full** before touching anything; it is the single source of truth for architecture, schema, file paths, tests and Definition of Done. This prompt tells you how to work; the plan tells you what to build.

The idea in one sentence (the owner's words: "like AOSP vanilla"): the **core** is a generic commerce OS that knows nothing about any business type; everything vertical-specific (fashion, abayas, perfumes, food, digital, gifts, print, jewelry) lives in an **add-on** with a manifest; a new brand is born vanilla and receives a **starter pack** of add-ons based on the activity chosen at onboarding, and can later install/disable/remove add-ons itself from an **"الإضافات / Add-ons"** page.

## Preconditions (verify before starting; stop and report if any fails)

1. `docs/store-vertical-modules-implementation-plan.md` (v1) PR-1 is merged — commit `a2bfeca feat(store-profile): vertical + modules foundation, gating, onboarding` exists on `main` and `src/lib/store-profile.ts`, `src/hooks/use-store-profile.ts`, `src/components/settings/StoreProfileCard.tsx` exist.
2. v1 **PR-2 (Size Guide Studio)**, **PR-3 (`products.is_made_to_order`)** and **PR-4 (configurable fit profiles + placeholder variant)** are merged into `main`. Confirm with `git log --oneline -15` and by checking that `src/lib/size-guide.ts`, `src/lib/size-guide-templates.ts`, `src/components/storefront/size-guide/`, `src/routes/_authenticated/admin.b.$slug.size-guides.tsx`, the `is_made_to_order` column migration, and the `fit_profiles` migration exist. **If PR-3 or PR-4 is not merged yet, stop and report** — v2-B moves the files they touch and would create merge conflicts.
3. `main` is green: `npm run format:check && npm run typecheck && npm run lint && npx vitest run` all pass. Record the test count as your baseline.
4. `git status` is clean (no unrelated untracked files). If there are untracked migrations or files you did not create, ask the owner before continuing.
5. **v1 PR-5 is cancelled** — do not execute it; its content (vocabulary, AI context, mobile labels, super-admin, guard test) is delivered by v2-B/v2-C/v2-D as add-on contributions.

## Ground truth as of 2026-09-14 (re-verify — the tree is moving)

- At the time of writing: `a2bfeca` is committed locally on branch `feat/size-guide-studio`; PR-2 is in progress in the working tree (uncommitted); PR-3/PR-4 not started. Your session starts **after** those land, so re-derive: baseline test count, latest migration filename, and the latest definitions of `get_storefront_page_data` and `place_storefront_order_internal_20260710` (`grep -ln "FUNCTION public.<name>" supabase/migrations/*.sql | tail -1`).
- CI (`.github/workflows/ci.yml`) runs formatting → typecheck → lint → vitest, production build, migration validation, security audit, Playwright smoke tests. CI is **Node 20** (local is Node 24). Committed files are LF. `.prettierrc`: `printWidth 100, semi, doubleQuotes, trailingComma all`.
- Giant files (do not grow them): `src/routes/_authenticated/admin.b.$slug.inventory.tsx` (~7.4k lines), `admin.b.$slug.settings.tsx` (~7.2k), `admin.b.$slug.orders.$id.tsx` (~5.4k), `src/routes/$slug.product.$id.tsx` (~2.5k). In v2-B you **remove** fashion code from them and replace it with `<AddonSlot>` calls.
- Line numbers in the plan are intentionally sparse; it cites function/component names. Always `grep -n` before editing.

### Existing patterns you must mirror

| Need                            | Mirror this                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code registry of metadata       | `src/lib/connectors/connector-framework.ts` (`AVAILABLE_CONNECTORS`)                                                                                                                                                                                                      |
| Pure lib + behavioral tests     | `src/lib/storefront-mode.ts`, `src/lib/store-profile.ts` + `tests/store-profile.test.ts`, `tests/admin-storefront-mode.test.ts`                                                                                                                                           |
| Server functions with auth      | `src/lib/saas-billing/saas-billing.functions.ts` — `createServerFn` + `.middleware([requireSupabaseAuth])` + `requireBrandAccess(context, brandId)` / `requireSuperAdmin(context)` (lines ≈19-53); `supabaseAdmin` from `@/integrations/supabase/client.server` for seeds |
| Admin nav / Apps Hub            | `src/config/admin-navigation.ts` (`getAdminNavItems`, `tier: "core" \| "modular"`, `storeModules?`), `src/components/os/os-apps-hub-modal.tsx`                                                                                                                            |
| Admin data hook                 | `src/hooks/use-store-profile.ts` (`useAdminStoreProfile`) + `queryKeys.brand.*` in `src/lib/query-keys.ts`                                                                                                                                                                |
| Storefront data flow            | `get_storefront_page_data` → `src/routes/$slug.route.tsx` loader (`bootstrapData`) → `StorefrontProvider` in `src/lib/storefront-context.tsx` (`useStore`, `useStoreModules`)                                                                                             |
| New brand-scoped table + RLS    | `supabase/migrations/20260806142421_fix_categories_public_read_policy.sql`, `20260905100000_remediate_phase4_categories_rls_and_counts.sql:12-15` (`is_admin() AND can_access_brand(brand_id)`), `public.set_updated_at()` trigger fn                                     |
| Self-contained settings card    | `StoreProfileCard` (`src/components/settings/StoreProfileCard.tsx`) and `StorefrontModeCard` in `admin.b.$slug.settings.tsx`                                                                                                                                              |
| Super-admin managers            | `src/components/super/SuperAddonsManager.tsx`, `SuperPlansManager.tsx` mounted in `src/routes/_authenticated/admin.super.settings.tsx`                                                                                                                                    |
| Single `main h1` per admin page | `OsPageHeader` (`src/components/os/os-page-header.tsx`) — Playwright (`tests/desktop-audit.spec.ts:378`) requires exactly one                                                                                                                                             |
| Audit logging                   | `saas_audit_logs` inserts in `saas-billing.functions.ts`; brand-level `logActivity` in `src/lib/activity-log.ts`                                                                                                                                                          |

## Owner decisions (already made — apply, do not re-open)

1. **`abayas` is a separate activity from `fashion`** — plan §4.0: add it to `STORE_VERTICALS`, labels, defaults, legacy mapping, onboarding tile, constraint migration; existing `fashion` brands become `abayas`.
2. **Merchants install/disable/remove add-ons themselves** (self-serve). Super-admin controls availability/defaults via `platform_addon_policies` and can override anything.
3. **Uninstall never deletes data.** Data purge is a separate explicit action with typed confirmation, only for add-ons that declare `purge`.
4. **All add-ons are free at launch.** Keep `entitlementKey` in the type but set it on no manifest; skip v2-E.
5. **UI naming is "الإضافات / Add-ons"** everywhere (nav item, page, onboarding, super-admin). The existing Apps Hub keeps its name for nav pinning.
6. (Carried over from v1) Onboarding activity choice is mandatory; existing brands must see zero change; platform copy says "Boutique", never "Fashion".

## Non-negotiable rules

1. **Never edit an existing file under `supabase/migrations/`.** Add new files `YYYYMMDDHHMMSS_description.sql` with a timestamp later than the newest existing one. Run `npm run db:migrations:check` after each. Re-apply `security_invoker=false` + grants whenever you redefine `brand_public_settings`; never expose `admin_typography`. Copy RPCs **whole** from their latest definition.
2. **Do not change `create_tenant_with_defaults`'s signature** (overload trap). Starter-pack installation happens in the server function after brand creation.
3. **Do not edit `package.json`** or add dependencies.
4. **Zero behavior change for existing brands** in v2-A and v2-B. Each PR description carries a "regression proof": existing abaya brand screens before/after (product page, account tabs, customer detail, order detail, inventory presets, settings) stated as identical, with screenshots for v2-B.
5. **Core must not know any vertical.** After v2-B: no file outside `src/addons/**` imports `@/addons/*` except `@/addons/registry` via `src/lib/addons/addon-registry.ts` (ESLint `no-restricted-imports` + `tests/vanilla-core-guard.test.ts` per plan §5.4). No "عباية/abaya/الخياط/Sent to Tailor/Fit Passport/SizeGuide" strings outside `src/addons/**` and the small allow-list.
6. **Add-on isolation at runtime**: every slot contribution renders inside `AddonErrorBoundary` + `Suspense`; a crashing add-on must not break the page (write a test that throws inside a fake contribution).
7. **Seeds are idempotent and recorded** in `brand_addons.seeded_keys`; running install twice is a no-op (test it). Seeds and `settingsPatchOnInstall` never overwrite a value the merchant already changed.
8. **Never weaken tests.** When you move a file that a source-string test reads (e.g. `tests/storefront-fit-passport.test.ts`, `tests/manual-order-tailoring-specs.test.ts`, `tests/size-guide*.test.ts`), update the path in the test with the **same assertions** and say so in the commit message. New pure libs (`addon-registry`, `addon-compat`, starter packs, dependency resolution, vocabulary merge) get **behavioral** tests.
9. **Design-system guardrails**: no `text-[10px]`/`text-[11px]`; no `border-border/50`; no raw `<button>` (use `Button`); no hex colors in `className`. **i18n**: every string Arabic + English, RTL-safe.
10. **Playwright**: every admin page exactly one `main h1` via `OsPageHeader` — including the new `/admin/b/$slug/addons` route.
11. **Opportunistic decomposition**: new UI lives in new files under `src/components/addons/`, `src/addons/<id>/components/`, `src/lib/addons/`. In giant files only delete fashion blocks and insert `<AddonSlot …/>` lines.
12. **Migration of `store_modules`** (plan §4.2) must reproduce today's resolved modules exactly (`override ?? default(vertical)`); write a SQL comment showing the mapping and a test on `modulesFromAddons` proving PR-1 gating still works. `store_modules` stays as a deprecated column (do not drop it in this work).
13. **Transitional fallbacks**: if `bootstrapData.addons` is absent (migration not yet applied in production), derive modules from `store_modules` as today. Keep the `?? "fashion"`-style fallbacks that PR-1 introduced; note their removal as a follow-up.
14. **Scope discipline**: build exactly the plan's phase. No v2-E. No third-party/dynamic add-on loading. Do not rename DB values (`sent_to_tailor`, `order_type='tailoring'`, `location='custom'`).
15. **Git**: branch from up-to-date `main`; conventional commits; one PR per phase; never push to `main`; never force-push. Verification gate before each PR (paste output in the PR):
    ```bash
    npm run format:check && npm run typecheck && npm run lint && npx vitest run
    ```
    plus `npm run db:migrations:check` when a migration was added, and `npm run build` for v2-A and v2-B.
16. **Stop conditions** — stop and report instead of working around: a pre-existing test fails; a fix needs an old migration edited or an RPC signature changed; a v1 PR turns out unmerged; `validateRegistry()` reports a cycle you cannot resolve without changing the plan's catalog; moving a file would break a public URL (`/$slug/size-guide`) — keep the route file and move only its content.
17. **Report per task**: (a) commands + results, (b) files changed with one line each, (c) decisions/alternatives, (d) skipped/uncertain, (e) the plan's per-PR manual checks with results.

---

## Task A — Add-ons platform foundation (branch `feat/addons-platform`) → **PR v2-A**

Execute plan **§4.0 → §4.6** completely:

- `abayas` activity (§4.0): `store-profile.ts`, `variant-sku-utils.ts`, `onboard.tsx` tile, constraint + `fashion → abayas` backfill, `tests/store-profile.test.ts` updated with same intent.
- `src/lib/addons/addon-types.ts`, `addon-registry.ts`, `addon-compat.ts` with the exact exports in §4.1; `src/addons/registry.ts` + manifests for `size-guides`, `fit-passport`, `made-to-order`, `fashion-core`, `abaya-pack` — contributions point at the **existing** components (wrapped in `React.lazy`), files not moved yet.
- Migration (§4.2): `brand_addons`, `platform_addon_policies`, `brand_addon_events`, RLS/grants, `store_modules → brand_addons` migration (module defaults must include `abayas`), `fashion-core` + `abaya-pack` rows for existing brands with `seeded_keys` pre-marked, and `get_storefront_page_data` redefined to return `addons`.
- Server functions (§4.3): `listBrandAddons`, `installAddon`, `setAddonStatus`, `uninstallAddon` (data kept; `purge` separate), `updateAddonSettings`, `upgradeBrandAddons`, `installStarterPack` — self-serve for brand admins, no entitlement checks needed now (leave the hook in place, unused).
- Hooks/providers (§4.4–4.5): `useBrandAddons`, `AddonsProvider`, `AddonSlot`, `AddonErrorBoundary`; `useAdminStoreProfile` and `useStoreModules` derive `modules` via `modulesFromAddons`; `StoreProfileCard` toggles call install/setStatus.
- Tests (§4.6): `tests/addon-registry.test.ts`, `tests/addon-compat.test.ts`, source check for `'addons', v_addons`, error-boundary test, idempotent-seed test.

**Manual verification:** an existing abaya brand looks identical everywhere; `brand_addons` has 5 rows for it; a `general` brand has none; toggling a switch in `StoreProfileCard` creates/updates a `brand_addons` row and the UI reacts after reload.

**Done when**: PR v2-A green, `npm run build` passes, and no visual change for any brand.

---

## Task B — Extraction: the core becomes vanilla (branch `refactor/extract-fashion-addons`) → **PR v2-B**

Execute plan **§5.1 → §5.4**:

- `git mv` the files listed in §5.1 into `src/addons/<id>/…`; thin route files stay in `src/routes` and gate with `useAddonInstalled(id)` → `notFound()`.
- Replace the 12 PR-1 gating sites (§5.2) with `<AddonSlot placement=…>`; extend `getAdminNavItems` with `addonNavItems`; `getOrderWorkflow` takes `productionStages` from add-ons instead of assuming tailoring stages exist.
- Vocabulary + AI context as contributions (§5.3): `src/lib/store-vocabulary.ts` with a **generic** default; `fashion-core` contributes today's strings verbatim (test); `getBrandAiContext` composes `aiContext` from installed add-ons and is injected into Copilot / Instagram importer / variant generator / translate prompts; fashion-only heuristics gated on `fashion-core`/`abaya-pack` being installed.
- Guards (§5.4): ESLint `no-restricted-imports` rule, `tests/vanilla-core-guard.test.ts`, registry test that every slot component loads.
- Update moved-file paths in existing source-string tests (same assertions).

**Manual verification (with screenshots in the PR):** existing abaya brand — product page (size guide button, Passport block, ready/custom toggle, workshop notes), account "مقاساتي" tab, customer detail Passport card, order detail tailoring panel and tailor actions, inventory presets — all identical to before. A `general` brand shows none of them and no fashion word anywhere (admin, storefront, invoice).

**Done when**: PR v2-B green, guard test green, screenshots attached, `npm run build` passes.

---

## Task C — Add-ons page, onboarding starter pack, super-admin (branch `feat/addon-store`) → **PR v2-C**

Execute plan **§6.1 → §6.4**:

- `/admin/b/$slug/addons` page + nav item (`id: "addons"`, "الإضافات / Add-ons", tier `core`, `store_setup`) + button in `OsAppsHubModal`; tabs Installed / Recommended for your activity / All; cards with "what it adds" generated from the manifest; install with dependency prompt; disable; enable; uninstall (data kept) with a separate typed-confirmation purge only when `manifest.purge` exists; settings drawer generated from `settingsSchema`; events log.
- Onboarding (§6.2): after the mandatory activity choice, show `starterPackFor(activity)` (required locked, suggested as checkboxes); `registerInstantTrial` accepts `selectedAddonIds` (validated against the pack) and calls `installStarterPack` internally after step 6b; super-admin request approval installs the default pack.
- Super-admin (§6.3): add-ons column + `AddonStore` in super mode on brand detail; `SuperAddonPoliciesManager` (availability, default_for_activities; entitlement mapping field present but unused).
- Tests (§6.4) + manual checks: install `size-guides` on a general brand → nav item and product-page button appear after reload; disable hides them, data stays; removing `made-to-order` while `print-stamps` depends on it is refused with the dependents listed; new brand via `/onboard` with "عبايات" gets 5 add-ons installed automatically.

**Done when**: PR v2-C green and all four manual checks recorded.

---

## Task D — Activity packs, mobile, polish (branch `feat/activity-packs`) → **PR v2-D**

Execute plan **§7** (catalog in §3):

- Manifests for `beauty-perfume`, `food-beverage`, `digital-products`, `gifts`, `print-stamps`, `jewelry` (and `fashion-core` completeness): seeds using only existing tables (`size_guides`, `customization_options`, `categories`, `business_settings`), `settingsPatchOnInstall`, `variantAxisDefaults` (core honors: product label → add-on default → generic; `null` hides the axis), `vocabulary`, `aiContext`, `readinessChecks`, `trustBadgeSuggestions`.
- Mobile `apps/boutq-os-mobile`: read installed `brand_addons` alongside `business_settings`; a standalone vocabulary map; production stages shown only if `made-to-order` is installed.
- Telemetry: `addon_installed` / `addon_uninstalled` in `saas_audit_logs`.
- Tests: every pack passes `validateRegistry`; seeds idempotent; vocabulary `general` has no خياط/Tailor/قماش; `vanilla-core-guard` still green.

**Manual verification:** a new "عطور" brand is vanilla + perfume pack (axis labels Volume/Concentration, fabric hidden); a new "مأكولات" brand has pickup enabled and kitchen vocabulary; the mobile app reflects installed add-ons.

**Done when**: PR v2-D green and the plan's §11 Definition of Done is fully checked.

---

## Final deliverable

`docs/handoff-report-addons-platform-<date>.md` with: per-task status and PR links; verification-gate output per PR; regression proofs and screenshots (v2-B); manual-check results; the list of moved files and updated test paths; decisions/alternatives; and follow-ups (drop `store_modules`, remove transitional fallbacks, v2-E pricing when the owner decides).
