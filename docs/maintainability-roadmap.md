# Maintainability roadmap

A ready-to-use brief for any engineer or AI agent working on the codebase's
structure. Hand it over as-is. The numbers were measured on 2026-09-24; re-measure
before relying on them.

---

# Mission: make the Boutq codebase easy for any engineer or AI to change safely

You are working in the Boutq repository (multi-tenant e-commerce SaaS: TanStack Start +
React 19.2 + Vite on Cloudflare Workers, Supabase (Postgres, RLS, Edge Functions),
Tailwind v4 + shadcn/ui, Vitest, plus an Expo mobile app in `apps/boutq-os-mobile`
on React 19.1). The UI is bilingual (Arabic RTL / English).

The surface is already clean (measured 2026-09-24): `npm run check` passes, ESLint has
0 errors and 0 warnings and runs with `--max-warnings 0`, there is no
`eslint-suppressions.json`, TypeScript `strict` is on, 1078 tests pass. Your job is the
structure underneath. Work in the phases below, in order. Do not start a phase before
the previous one is merged or explicitly skipped by the owner.

## Measured problems (verify each number yourself before relying on it)

1. Giant files: 31 source files exceed 1000 lines. Largest:
   `src/routes/_authenticated/admin.b.$slug.inventory.tsx` (8,459),
   `admin.b.$slug.orders.$id.tsx` (5,022), `admin.b.$slug.orders.index.tsx` (3,456),
   `src/routes/$slug.checkout.tsx` (2,809), `src/features/settings/registry.ts` (2,616),
   `src/routes/$slug.product.$id.tsx` (2,570), `admin.b.$slug.content-studio.tsx` (2,488),
   `admin.b.$slug.dashboard.tsx` (2,105).
2. Type escapes: 990 `as any`, 784 `: any`, 40 `as never` (mostly
   `supabase.from("x" as never)`, meaning generated DB types are stale).
   `@typescript-eslint/no-explicit-any` is off.
3. Migration drift: `supabase migration list --linked` shows 283 versions, 32 local-only
   and 23 remote-only. `docs/database-recovery.md` forbids `db push` while drift is
   unexplained. Migration files do NOT reliably describe production.
4. Scattered data access: 393 direct Supabase calls inside `src/routes`,
   `src/components`, `src/features`. Identical select strings are copy-pasted
   (e.g. the product-card select appears 3 times in `src/routes/$slug.$category.tsx`;
   the PDP has an inline query duplicating `fetchProductDetail` in
   `src/lib/storefront-queries.ts`).
5. Brittle tests: 71 of 173 test files read source files with `readFileSync` and assert
   on strings. They break on harmless refactors and can guard dead code.
6. No entry point for newcomers: no root `README.md`, `AGENTS.md` or `CLAUDE.md`.
   Design rules, agents and skills live in `.agents/` (loaded by the agent tooling, but
   invisible to a person or tool that starts from the repo root).
   `docs/` has 25 files, many of them old plans and `ai-handoff-*` notes, some with
   statements that are no longer true.

Target pattern already in the repo, copy it: one shared resolver used by every surface
(`src/lib/variant-axes.ts` for variant option labels, `src/lib/hero-media.ts` for hero
media and framing), with unit tests on the pure logic.

## Non-negotiable rules

- Never write to the production database without the owner's explicit approval in chat.
  The Supabase CLI is linked to production (`supabase db query --linked` is fine for
  read-only SELECTs). This includes `supabase db push`, `supabase migration repair`
  (it writes the history table), any INSERT/UPDATE/DELETE/DDL, and deploying Edge
  Functions.
- Refactors must preserve behaviour. If you find a real bug, stop and report it
  separately (what, where, evidence, proposed fix) instead of silently changing
  behaviour inside a refactor commit.
- Delete code only when you've proven it is unused: grep for every reference, check
  `git log -S` for when it stopped being used, and name the commit in your message.
- Keep the zero-warning gate. Never add a suppressions file. A justified exception is
  an inline `// eslint-disable-next-line <rule> -- <reason>` on the exact line.
- Follow `.agents/rules/AGENTS.md` (design tokens, `<Button>` not raw `<button>`,
  44px touch targets, RTL-safe logical properties). `tests/design-system-guardrails.test.ts`
  budgets may only go down.
- Every commit: `npm run check` passes. If you touched the mobile app, also run
  `npx tsc --noEmit -p apps/boutq-os-mobile`. CI runs Linux on Node 20, while the owner
  develops on Windows: keep LF line endings and Node-20-compatible code.
- Vitest workers sometimes time out under machine load ("Failed to start forks
  worker"). Re-run the affected files on their own before concluding a test failed.
- Small, reviewable commits on a branch per phase. One PR per phase (large phases may
  be several PRs). Commit messages explain why, not just what.
- Bilingual UI: every user-facing string needs Arabic and English and must work in RTL.

## Project agents and skills — use them

The repo ships its own agents in `.agents/agents/`, skills in `.agents/skills/` and
always-on rules in `.agents/rules/AGENTS.md`. They encode project-specific knowledge;
use them instead of improvising.

- Before starting a phase, read the `SKILL.md` of every skill listed for it and follow
  it. If a skill conflicts with this brief, this brief wins for maintainability work;
  report the conflict.
- Run each phase through `cleanup-orchestrator` (map affected files, split the work,
  one owner per file).
- End every phase with `verification-gatekeeper` reviewing the full diff. Do not open
  the PR until it reports no behavioural or security change.
- Some files in `.agents/` may be out of date (as some of `docs/` was). If a skill or
  agent states something the code contradicts, trust the code, note it, and fix the
  file in Phase 1.

| Phase             | Skills to apply                                                                                                                                                                                                                                                        | Agents to use                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| All phases        | `refactor-safety`, `handoff-plan-execution`                                                                                                                                                                                                                            | `cleanup-orchestrator`, then `verification-gatekeeper`  |
| 0 — Ratchets      | `test-quality-gate`                                                                                                                                                                                                                                                    | —                                                       |
| 1 — Entry docs    | `rtl-arabic-consistency` (for anything user-facing)                                                                                                                                                                                                                    | —                                                       |
| 2 — Migrations    | `migration-hygiene`, `multi-tenant-security`, `secrets-credentials-security`                                                                                                                                                                                           | —                                                       |
| 3 — Types         | `data-access-consistency`, `multi-tenant-security`                                                                                                                                                                                                                     | `domain-refactorer`                                     |
| 4 — Data layer    | `data-access-consistency`, `multi-tenant-security`, `settings-registry-single-source`                                                                                                                                                                                  | `domain-refactorer`                                     |
| 5 — Split files   | `refactor-safety`, plus the domain skill of the file: `order-inventory-logic`, `financial-data-consistency`, `physical-goods-lifecycle`, `loyalty-points-integrity`, `team-roles-permission-granularity`, `storefront-premium-design-system`, `rtl-arabic-consistency` | `frontend-refactorer` (UI), `domain-refactorer` (logic) |
| 6 — Tests         | `test-quality-gate`                                                                                                                                                                                                                                                    | —                                                       |
| 7 — Keep it clean | `test-quality-gate`                                                                                                                                                                                                                                                    | `verification-gatekeeper`                               |

Your tool's own safety settings are the last line of defence: keep terminal commands
on "ask before running", so `supabase db push`, `supabase migration repair`, Edge
Function deploys and `wrangler deploy` always need the owner's approval.

## Phase 0 — Baseline and ratchet tooling

1. Branch from up-to-date `main`. If `feat/storefront-toggles-and-vocabulary-remediation`
   is not merged yet, ask the owner before starting.
2. Write `scripts/maintainability-metrics.mjs`. It prints JSON with:
   - per-file line counts for `src/**` (excluding `routeTree.gen.ts` and
     `src/integrations/supabase/types.ts`)
   - counts of `as any`, `: any`, `as never`, `@ts-ignore`, `@ts-expect-error`,
     `eslint-disable`
   - direct Supabase calls under `src/routes`, `src/components`, `src/features`
   - test files that use `readFileSync`
3. Add `tests/maintainability-ratchet.test.ts`, modelled on
   `tests/design-system-guardrails.test.ts`. It stores today's numbers as budgets and
   fails if any number goes UP. It also fails when:
   - any file already over 1000 lines grows, or
   - any NEW file exceeds 600 lines.

   Budgets are ceilings that may only move down; lower them in the same PR whenever a
   phase reduces a count.

4. Record the baseline in `docs/maintainability.md` (numbers + how to run the script).

Acceptance: `npm run check` passes; deliberately adding one `as any` makes the ratchet
test fail (verify, then revert).

## Phase 1 — Entry documentation (highest value for AI agents)

1. Create a root `AGENTS.md`, at most about 300 lines. Every statement must be true
   today; verify each against the code. Sections:
   - What Boutq is: tenants/brands, storefront vs admin, the V1 vs V2 storefront
     (`storefront_design_version`)
   - Stack and runtimes: web on React 19.2, mobile on React 19.1, Workers, Supabase
   - Commands: `npm run check`, `typecheck`, `lint`, `format`, `test`, the mobile
     typecheck, the metrics script
   - Directory map: `src/routes`, `src/features`, `src/components`, `src/lib`,
     `src/addons`, `supabase/functions`, `supabase/migrations`, `apps/boutq-os-mobile`,
     `tests`
   - Core domain concepts:
     - store verticals and addon packs (`src/lib/addons/addon-registry.ts`)
     - variant option axes (`src/lib/variant-axes.ts`: never label by column name)
     - hero media (`src/lib/hero-media.ts`)
     - store vocabulary
     - storefront modes
   - Architecture rules:
     - core must not import `@/addons/*` (enforced by ESLint)
     - data access goes through the data layer once Phase 4 lands
     - shared resolvers over per-surface logic
   - Database rules: production is linked, read-only by default, migration drift and
     its status, where the RLS helpers live (`can_access_brand`)
   - Quality gates: the zero-warning lint, the ratchets, design guardrails, how to
     write behaviour tests
   - Known pitfalls:
     - Vitest worker timeouts
     - jsdom stubs in `tests/setup.ts`
     - Windows vs Linux differences
     - generated files not to edit
2. Keep `.agents/rules/AGENTS.md`, `.agents/agents/` and `.agents/skills/` exactly where
   they are: the agent tooling loads them from there. The root `AGENTS.md` links to
   them and summarises when to use which (reuse the table in "Project agents and
   skills"); do not duplicate their content or move them.
3. Audit `.agents/` for accuracy the same way as `docs/` (step 5): fix statements the
   code contradicts, and list what you changed. Do not rename or delete skills or
   agents without the owner's approval.
4. Create a short root `README.md`: what the project is, setup, commands, and a pointer
   to `AGENTS.md`.
5. Audit `docs/`. Classify each file as current, outdated or historical. Move old plans
   and `ai-handoff-*` files into `docs/archive/` with an index line each. Fix or delete
   false statements in current docs. Add `docs/README.md` as the index. This roadmap
   stays in `docs/` until its phases are done.

Acceptance: a fresh agent given only `AGENTS.md` can answer "where do I change X" for
products, orders, storefront hero, settings, and addons. Test this by listing five such
questions and their answers in the PR description.

## Phase 2 — Reconcile migrations with production (read-only first, STOP before writes)

1. For each of the 32 local-only migrations, determine against the live schema
   (`pg_catalog`, `information_schema`, `pg_get_functiondef`, `pg_policies`) whether
   the change already exists in production, partly exists, or does not exist.
2. For each of the 23 remote-only versions, work out what they changed. Use the live
   schema and `supabase_migrations.schema_migrations` statements when available.
3. Write `docs/database-reconciliation.md`: one row per version with its status and
   evidence, plus a proposed plan. Typical steps:
   - recover remote-only migrations into files
   - mark already-applied local files with `migration repair --status applied`
   - decide what to do with never-applied files
4. STOP. Present the plan and wait for the owner's approval. Do not run
   `migration repair`, `db push` or any DDL without it.
5. After approval and execution:
   - `supabase migration list --linked` shows no one-sided versions
   - `npm run db:migrations:drift` passes
   - CI runs the drift check, if it doesn't already
   - update `docs/database-recovery.md`

## Phase 3 — Honest types

1. Regenerate `src/integrations/supabase/types.ts` from production (read-only:
   `supabase gen types typescript --linked`). Fix every compile error properly, without
   new casts.
2. Remove the 40 `as never` casts. Replace `as any` at data boundaries with generated
   row types or small domain types.
3. Prioritise the files Phase 4 and Phase 5 will touch. Lower the ratchet budgets as
   counts drop.
4. Document the regeneration command in `AGENTS.md`.
   - Consider a CI check that fails when the generated types differ from the schema.
     It must stay read-only, so ask the owner first.

Acceptance: `as never` is 0, `as any` and `: any` are measurably lower, `npm run check`
passes.

## Phase 4 — A data layer

1. Create `src/lib/data/<domain>/` for products, orders, customers, inventory, settings
   and storefront. Each domain has:
   - `selects.ts`: named select-field constants, typed with the generated types
   - `queries.ts`: fetchers and TanStack Query option factories
   - `keys.ts`: query-key factories, so every screen shares the cache
   - `mutations.ts` where writes exist
2. Start with the duplicated reads:
   - the product-card and category selects
   - `fetchProductDetail` vs the PDP inline query
   - orders list and order detail
3. Move call sites domain by domain. Once a domain is fully migrated, enforce it with
   ESLint `no-restricted-syntax` (or the ratchet) so `supabase.from("<table>")` cannot
   reappear in `src/routes` / `src/components` / `src/features` for those tables.
4. Keep RLS in mind: server functions using the service role must keep their existing
   `can_access_brand` checks.

Acceptance: the "direct Supabase calls" count drops and never rises; each migrated
domain has unit tests for its select/transform logic.

## Phase 5 — Split the giant files

1. Start with `admin.b.$slug.inventory.tsx`, then `admin.b.$slug.orders.$id.tsx`,
   `admin.b.$slug.orders.index.tsx` and `$slug.checkout.tsx`.
2. Method, behaviour-preserving:
   - first extract pure logic (calculations, formatting, validation) into
     `src/features/<domain>/lib/` with unit tests
   - then extract self-contained subcomponents (dialogs, cards, table rows) into
     `src/features/<domain>/components/`
   - the route file becomes composition only
3. One PR per file, or per big section of a file. No logic changes mixed in. Bug fixes
   go in separate commits, reported to the owner.
4. Aim for route files under 600 lines and components under 400. Lower the per-file
   budgets in the ratchet as files shrink.

Acceptance: no user-visible change. Manual smoke test of the touched screens (list the
flows checked in the PR), `npm run check` passes, ratchet budgets lowered.

## Phase 6 — Behaviour tests instead of source-string tests

1. Classify the 71 `readFileSync` tests:
   - (a) architecture guards worth keeping: import boundaries, design-token guardrails,
     "no hard-coded Color/Size label" style rules
   - (b) feature assertions that should become behaviour tests
2. Add test helpers, e.g. `renderWithStorefront(ui, { settings, brand, addons, lang })`
   and `renderWithAdmin(...)`, with the providers and Supabase mocked at the data-layer
   boundary.
3. Convert (b) tests to behaviour tests when their feature is touched, or proactively
   for checkout, cart, variant selection, orders filters, hero framing and settings save.
   Unit-test pure logic directly.
4. Lower the `readFileSync` ratchet as tests convert.

## Phase 7 — Keep it this way

- PR template (`.github/pull_request_template.md`), a checklist:
  - `npm run check` passed
  - ratchet budgets not raised
  - `AGENTS.md` updated if architecture or commands changed
  - DB writes approved
  - Arabic, English and RTL checked
  - screenshots for UI changes
- Final pass on `AGENTS.md` and `docs/maintainability.md` with the new numbers.

## How to report after each phase

Give a short report:

- what changed, with numbers before and after (from the metrics script)
- what you verified and how, including anything you could not verify
- bugs or risks you found but did not change
- decisions you need from the owner

Do not claim something works without running it.
