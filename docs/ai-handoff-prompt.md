# Handoff Prompt — Boutq OS: CI stabilization, hygiene, catalog mode, money-path tests

Copy everything below the line into a new AI-assistant session opened at the repository root.

---

You are a senior engineer working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — a multi-tenant SaaS e-commerce OS for GCC fashion boutiques; TanStack Start + React + Supabase + Cloudflare Workers; two Expo WebView-shell mobile apps under `apps/`). Work directly in this checkout. Execute the tasks below **in order**, one branch + one PR per task, verifying after every task. Do not skip ahead. Do not start Task N+1 until Task N's PR is open and its checks are green (or you have reported a blocker).

## Ground truth as of 2026-09-13 (verified — do not re-derive, but do re-check before relying on line numbers)

- `npm run typecheck` → 0 errors.
- `npx vitest run` → **102 files, 541 tests, all passing**. Any failing test you see after your change is caused by your change.
- `npx eslint .` → **0 errors**, 24 warnings (all `react-hooks/exhaustive-deps`), **1** `prettier/prettier` issue: `tests/store-readiness.test.ts:147` ("Delete ⏎").
- GitHub Actions workflow `.github/workflows/ci.yml` ("CI & Release Safety") runs on push/PR to `main`. It is **failing on every push to `main`** for three reasons:
  1. Job **"Codebase Validation & Unit Tests"** → step "Check code formatting" (`npm run format:check`) fails on the one file above, so typecheck/lint/tests are skipped.
  2. Job **"Security Vulnerability & Secret Scan"** → step "Run dependency audit" (`npm audit --audit-level=high`) fails: 12 high-severity advisories, all `fixAvailable=true`, 2 direct deps (`@cloudflare/vite-plugin`, `wrangler`), 10 transitive (react-native/metro/expo chain, `sharp`, `image-size`, `js-yaml`, `miniflare`). Gitleaks step is skipped because audit fails first.
  3. Job **"Playwright Browser Smoke Tests"** fails with these exact symptoms:
     - `Error: /admin/b/test-brand/customers must expose one page heading` — `expect(locator).toHaveCount(expected)` (from `tests/desktop-audit.spec.ts`; the route renders more than one page heading).
     - Browser error: `Query data cannot be undefined ... Affected query key: ["admin-typography","test-brand"]` (a `useQuery` queryFn returns `undefined`).
     - Browser warning repeated: `[useEntitlements] RPC failed: {code: PGRST301, message: Expected 3 parts in JWT; got 1}` (RPC called without a valid session in the test environment).
     - Browser error: `Can't perform a React state update on a component that hasn't mounted yet` (a render-time async state update somewhere on the audited admin routes).
- Jobs "Production Build Validation" and "Validate Supabase SQL Migrations" pass.
- `main` has **no branch protection** (`gh api repos/SayedMajeedx/bhpura-d219813a/branches/main/protection` → 404).
- CI runs on **Node 20**; local machine has Node 24. Keep everything Node-20 compatible.
- Local git: `core.autocrlf=false`; committed files are LF. Do not introduce CRLF.
- `.prettierrc`: `printWidth 100, semi, doubleQuotes, trailingComma all, endOfLine auto`. `.prettierignore` excludes `supabase/migrations/*.sql`, `routeTree.gen.ts`, lockfiles.
- ESLint (`eslint.config.js`): `@typescript-eslint/no-unused-vars` is currently **"off"**; `no-explicit-any` off; prettier runs as an ESLint rule; `eslint-suppressions.json` exists and ESLint reports "suppressions left that do not occur anymore".
- A dead-code cleanup already landed (`chore: remove unused imports, dead types and unreferenced locals`), so the codebase currently has ~0 unused locals/imports.
- Largest files (lines): `src/routes/_authenticated/admin.b.$slug.inventory.tsx` 7,406; `admin.b.$slug.settings.tsx` 6,719; `admin.b.$slug.orders.$id.tsx` 5,412; `src/routes/$slug.product.$id.tsx` 2,352.
- A complete, verified implementation plan for the catalog-mode feature exists at **`docs/storefront-mode-implementation-plan.md`**. Task 4 executes it.

## Non-negotiable rules (apply to every task)

1. **Never edit an existing file under `supabase/migrations/`.** Only add new migration files named `YYYYMMDDHHMMSS_description.sql`. Run `npm run db:migrations:check` after adding one.
2. **Do not hand-edit dependency version ranges in `package.json`** except where Task 1b explicitly allows it. Never run `npm audit fix --force`.
3. **Never delete, skip, `.only`, comment out, or weaken an assertion in a test to make it pass.** If a test is wrong, fix the code it guards, or change the test so it asserts the same intent against the correct target — and say so in the commit message.
4. **Zero behavior change** outside the explicit feature work in Task 4: no changes to server-action logic, DB queries, API schemas, RLS, `brand_id` tenant filtering, or UI styling unless a task calls for it.
5. **Design-system guardrails**: no `text-[10px]`/`text-[11px]` (use `text-xs`); no opacity-hacked borders like `border-border/50`; no raw `<button>` (use `Button` from `@/components/ui/button`); no hard-coded hex colors in className. `tests/design-system-guardrails.test.ts` enforces some of this.
6. **i18n**: follow the pattern already used in the file you edit (mostly inline `lang === "ar" ? "..." : "..."`). Every user-visible string needs Arabic and English.
7. **Git**: branch from an up-to-date `main`; conventional commit messages (`chore:`, `fix:`, `feat:`, `test:`); one PR per task with a description listing what changed, why, and the verification output. Never push directly to `main`. Never force-push.
8. **Verification gate after every task** (paste the summarized output in the PR description):
   ```bash
   npm run format:check && npm run typecheck && npm run lint && npx vitest run
   ```
   plus `npm run db:migrations:check` if you added a migration, and `npm run build` for Tasks 1 and 4.
9. **Stop conditions** — stop, do not work around, and report: a test fails that your change did not cause; a fix would require editing an existing migration; a fix would require `--force` or a major-version bump; you lack permissions (e.g., branch protection API returns 403).
10. **Report format at the end of each task**: (a) commands run and their result, (b) files changed with one line each on why, (c) decisions made and alternatives rejected, (d) anything skipped or uncertain.

---

## Task 1 — Make CI green on `main` (branch `chore/ci-green`)

### 1a. Formatting gate

- `npx prettier --write tests/store-readiness.test.ts`, then `npm run format:check` must exit 0.
- `npx eslint . --prune-suppressions` to drop stale entries in `eslint-suppressions.json`; confirm `npm run lint` still exits 0 (warnings are allowed, errors are not).

### 1b. Dependency audit (`npm audit --audit-level=high` must exit 0)

Decision tree — follow it in order and stop at the first step that gets the audit to exit 0:

1. `npm audit fix` (no `--force`). If this resolves all high advisories with **lockfile-only** changes (verify `git diff --stat package.json` is empty), accept it.
2. If direct deps still flagged: `@cloudflare/vite-plugin` and `wrangler` may be bumped in `package.json` **within their current major version only** (check with `npm view <pkg> versions`). After bumping: `npm install`, `npm run build`, and `npx wrangler deploy --dry-run --config dist/server/wrangler.json` must all succeed.
3. If remaining high advisories are only in the **react-native/expo/metro** transitive chain (used by the mobile apps, not the web worker): check whether those packages are pulled in only via `devDependencies` or via the `apps/*` projects. If they are dev-only for the web build, change the CI step to `npm audit --audit-level=high --omit=dev` **and** document in the PR why (with the advisory names). If they are runtime deps of the mobile apps, stop and report the exact packages and the major bump each would require — do not bump majors.
4. Never suppress the audit step or add `continue-on-error`.

### 1c. Playwright smoke failures (all four)

You may not be able to run Playwright locally (it needs Supabase env for the `test-brand` seed). Work from source + the CI logs; if you can run `npx playwright test tests/desktop-audit.spec.ts` locally with `.env`, do so.

1. **Duplicate page heading on `/admin/b/test-brand/customers`**: open `tests/desktop-audit.spec.ts`, find the "must expose one page heading" assertion and which selector it counts (likely `h1` or `[data-page-heading]`). Open `src/routes/_authenticated/admin.b.$slug.customers.tsx` and the components it renders (command header, work queue, mobile cards) and make exactly one element match the selector. Do **not** change the test. Check the other admin routes the same spec audits so you don't move the problem.
2. **`["admin-typography", brand]` returns `undefined`**: `grep -rn '"admin-typography"' src` → in that `useQuery`, make the `queryFn` return `null` (or a typed default object) on the not-found / error-free-empty path instead of `undefined`. Do not change consumers' behavior — verify they already handle `null`.
3. **`useEntitlements` RPC with invalid JWT**: open `src/lib/saas-billing/use-entitlements.ts`. Ensure the RPC is only called when there is an authenticated Supabase session (gate with `enabled:` on the query or an early return); on failure, it must degrade to the existing fallback without console noise. Then check why the Playwright environment has no valid JWT for `test-brand` (look at `playwright.config.ts`, `tests/setup.ts`, and the `[WebServer]` block in `ci.yml` around the `supabaseAdmin` usage at "line 367" in the log) — if the smoke tests are meant to run authenticated, fix the setup; if they're meant to run as guest, the gate above is the fix.
4. **"state update on a component that hasn't mounted yet"**: this is a `setState` (or a store update) executed synchronously during render or inside an async callback fired from render. Use the CI log timestamps to see which route was loading when it appeared; search that route and its children for `useState` setters called outside `useEffect`/handlers, and for `queryClient.setQueryData`/`router.navigate` in render. Move the work into `useEffect`.

### 1d. Branch protection (only after CI is green on `main` at least once)

Use the GitHub CLI (already authenticated on this machine):

```bash
gh api -X PUT repos/SayedMajeedx/bhpura-d219813a/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Codebase Validation & Unit Tests",
      "Production Build Validation",
      "Validate Supabase SQL Migrations",
      "Security Vulnerability & Secret Scan",
      "Playwright Browser Smoke Tests"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false
}
JSON
```

Confirm with `gh api repos/SayedMajeedx/bhpura-d219813a/branches/main/protection`. If you get 403, print the JSON above in your report for the owner to apply.

**Done when**: the latest run of "CI & Release Safety" on `main` is fully green and branch protection is active (or handed to the owner).

---

## Task 2 — Keep the codebase clean: lint rule + ignores + workspace hygiene (branch `chore/lint-and-hygiene`)

1. In `eslint.config.js`, replace `"@typescript-eslint/no-unused-vars": "off"` with:
   ```js
   "@typescript-eslint/no-unused-vars": [
     "warn",
     { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
   ],
   ```
   Run `npm run lint`; the codebase was just cleaned, so expect near-zero new warnings. Fix any that appear in `src/` and `apps/` (remove the unused symbol; for unused function parameters that must stay positional, prefix with `_`). Do **not** add `--max-warnings` to the lint script — warnings stay non-blocking.
2. Add to the `ignores` array in `eslint.config.js`: `".local-tools/**"`, `"NUL/**"`, `".recovery/**"`, `".tmp-xdg/**"`, `"test-results/**"`, `".expo/**"`, `"apps/**/.expo/**"`, `".wrangler-local/**"`. (ESLint currently parses an Android NDK `sorttable.js` inside `.local-tools`.)
3. Append to `.gitignore` (keep existing entries): `.codex-*/`, `.local-tools/`, `NUL/`, `.tmp-*`, `.recovery/`, `.tool-config/*.log`, `test-results/`, `.wrangler-local/`, `.expo/`, `apps/*/.expo/`.
4. Workspace cleanup (local filesystem only, not git history). First run `git status --porcelain --ignored` and delete an item **only** if it is listed as `??` or `!!`: the directories `.codex-deploy-whatsapp/`, `.codex-release-reviewed/`, `.local-tools/`, `NUL/`, `.recovery/`, `.tmp-xdg/`, `.wrangler-local/`, `test-results/`; the root files `.codex-*.log`, `.tmp-preview*.log`, `.tmp-live-migration-history.sql`, `.wrangler-*.log`, `debug.log`, and `.tool-config/*.log`. **Never delete** `.env`, `apps/*/.env`, `node_modules/`, `.git/`, `.claude/`, `.output/`, `dist/`, or the tracked file `.tool-config/production-public-schema.sql`. List what you deleted in the report.

**Done when**: `npm run lint` exits 0, no lint output references `.local-tools`, and `git status` is clean apart from your intended changes.

---

## Task 3 — Catalog mode (Shop vs Catalog + WhatsApp inquiry) — three PRs

Execute **`docs/storefront-mode-implementation-plan.md`** exactly: Phase 1 → PR-1 (`feat/storefront-catalog-mode`), Phase 2 → PR-2 (`feat/admin-storefront-mode`), Phase 3 → PR-3 (`feat/catalog-inquiries`). **Skip Phase 4** (SaaS gating, per-product hybrid). Payment links are explicitly out of scope — do not build them.

Owner decisions for the plan's "open decisions" (section 6) — use these unless told otherwise:

- `catalog_show_prices` default: `true`.
- Returns nav item: **keep** visible in catalog mode.
- Discounts nav item: **hide** in catalog mode.
- Account "my orders": **keep** visible.
- No SaaS gating.

Additional requirements on top of the plan:

- **Opportunistic decomposition** (the giant-file problem): when you edit `src/routes/$slug.product.$id.tsx`, extract the purchase CTA region (add-to-cart / quantity / sticky mobile bar / new WhatsApp button) into `src/components/storefront/ProductPurchaseActions.tsx` with a typed props interface; when you edit the Storefront tab in `admin.b.$slug.settings.tsx`, put the new mode card in `src/components/settings/StorefrontModeCard.tsx`. Extract only what you are touching; do not refactor unrelated regions.
- The new helper module `src/lib/storefront-mode.ts` must have **real behavioral unit tests** (the plan lists the cases) — not source-string assertions.
- Before opening PR-1, run the manual verification listed in the plan's section 5 against a test brand (toggle `storefront_mode` via SQL, verify UI + RPC rejection + Public API 403, then toggle back). Record the results in the PR.
- Re-verify the line numbers cited in the plan before editing; they were accurate on 2026-09-12 but recent commits may have shifted them.

**Done when**: three PRs are green, and a brand in `catalog` mode shows no cart/checkout, opens `wa.me` with product + variant + URL, and both `place_storefront_order` and `POST /api/v1/orders` reject with `STOREFRONT_CATALOG_MODE`.

---

## Task 4 — Behavioral tests for the money paths (branch `test/money-path-behavioral`)

Context: 49 of the 102 test files assert by reading source files as text and matching substrings/regex. They break on refactors and do not catch logic bugs. Do not delete them; add real tests beside them where it matters most — money.

1. Inventory: for each test file among `order-workflow`, `orders-bulk-payment-courier`, `payment-method`, `payment-reference`, `tap-payment-reconciliation`, `returns-and-exchanges`, `order-profit-clarity`, `accounting-*`, `saas-billing-and-entitlements`, `subscription-renewal-decision`, `annual-subscription-regressions`, `loyalty-and-abandoned-carts`, `packaging-bom-deduction`, `inventory-stock-calculation`, `format`, `os-formatting`: classify each `it()` as **behavioral** (calls a function and asserts on its return) or **textual** (asserts on file contents). Put the table in the PR description.
2. For every textual test guarding a **pure TypeScript function** (totals, discounts, VAT, refunds, payment-status transitions, fulfillment-status transitions, formatting, entitlement evaluation, stock math), write a behavioral test that exercises the real function with representative inputs and edge cases (zero, negative, rounding to 3 decimals for BHD, Arabic/English variants, null/undefined inputs). Name the new files `tests/<area>.behavior.test.ts`.
3. For logic that lives only in Postgres RPCs (`place_storefront_order`, returns RPCs, accounting SQL), keep the SQL contract tests; do not attempt DB integration tests unless a local Supabase is already configured in the repo (check `supabase/config.toml` and `tests/setup.ts` first and state your finding).
4. If a behavioral test reveals a real bug, **do not fix it in this PR** — open a separate issue/PR with the failing test marked clearly in the report, and keep the test file passing by asserting current behavior only after confirming with the owner. (Stop condition #9 applies.)

**Done when**: every money-path pure function has at least one behavioral test file, the suite passes, and the PR description contains the classification table.

---

## Task 5 (optional, lowest priority) — `react-hooks/exhaustive-deps` warnings (branch `fix/hook-deps`)

There are 24. For each: if the missing dependency is a stable React setter, a `useCallback`-wrapped function, or a primitive that only changes when the effect _should_ re-run, add it. If adding it would change how often the effect/memo runs in a way you cannot prove is equivalent, **leave it** and list it in the report with the reason. Never add `// eslint-disable-next-line react-hooks/exhaustive-deps`. Wrapping a function in `useCallback` is allowed only when it is used solely inside that hook.

---

## Final deliverable

A single summary comment (or `docs/handoff-report-<date>.md`) with: per-task status, PR links, verification outputs, deleted workspace items, the audit decision taken in 1b, the branch-protection state, the Task 4 classification table, and the list of Task 5 warnings left untouched with reasons.
