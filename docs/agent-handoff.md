# Agent handoff: continuing the maintainability roadmap

Written 2026-09-25 by the agent that ran Phases 4–5 so far (PRs #42–#66), for
the next agent (a new Claude account with no memory of that work). Everything
you need is in the repository; nothing lives only in the old session.

---

## 0. Paste this as your first message in the new session

> You are continuing the maintainability roadmap of this repository. Before
> doing anything, read in this order: `AGENTS.md`, `docs/agent-handoff.md`
> (all of it), `docs/maintainability-roadmap.md`, `src/lib/data/README.md`,
> `docs/bug-backlog.md`, `.agents/skills/data-layer-migration/SKILL.md`,
> `.agents/skills/giant-file-split/SKILL.md`, `.agents/rules/AGENTS.md`, and the
> skills listed for the current phase. Then run `git checkout main && git pull`,
> `npm ci`, `npm run check` and `node scripts/maintainability-metrics.mjs`, and
> compare the numbers with section 2 of the handoff. Report what you found and
> the next step from section 4 before changing code. Follow the owner rules in
> section 3 exactly: in particular, never write to the production database
> yourself and merge PRs only when I say "merge when green".

---

## 1. The project in two minutes

Boutq: multi-tenant e-commerce for GCC boutiques. TanStack Start (React 19.2,
Vite) on Cloudflare Workers, Supabase (Postgres + RLS, Edge Functions),
Tailwind v4, Vitest, Playwright (CI only), an Expo app in
`apps/boutq-os-mobile`. Bilingual Arabic (RTL) / English. `AGENTS.md` is the
architecture guide; this file is about the ongoing work.

The owner is the only person on the project; they work on **Windows** (Git
Bash + PowerShell), in the Claude desktop app, and review PRs on GitHub
(`SayedMajeedx/bhpura-d219813a`). They write short instructions ("merge when
green then continue with X") and expect a short report after each step.

## 2. Where things stand (2026-09-25, `main` at `1cd8581f`)

Measured with `node scripts/maintainability-metrics.mjs`:

| Metric                                | Roadmap start (09-24) | Now                                                                                                                        |
| ------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Files over 1000 lines                 | 31                    | 23                                                                                                                         |
| `as any`                              | 990                   | 596                                                                                                                        |
| `: any`                               | 784                   | 724                                                                                                                        |
| `as never`                            | 40                    | 0                                                                                                                          |
| Direct Supabase calls in screens      | 393                   | 25 (metric re-based 09-25 to count cast-wrapped calls: 200 then); all server routes, one realtime subscription and bug #27 |
| Test files using `readFileSync`       | 71                    | 71                                                                                                                         |
| Tests                                 | 1078                  | 1567                                                                                                                       |
| Migration drift (local vs production) | 32 / 23 one-sided     | 0 (261 versions)                                                                                                           |

### Phases

| Phase               | Status                                                                                                                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Ratchets          | Done (`tests/maintainability-ratchet.test.ts`).                                                                                                                                                                                                                                                                       |
| 1 Entry docs        | Done (`AGENTS.md`, `README.md`, `docs/README.md`).                                                                                                                                                                                                                                                                    |
| 2 Migrations        | Done: zero drift, CI job "Supabase Linked Migration Drift Check".                                                                                                                                                                                                                                                     |
| 3 Honest types      | Types regenerated from production (#35), `as never` = 0. `any` reduction continues alongside Phase 4.                                                                                                                                                                                                                 |
| 4 Data layer        | **Done for screens** (#63–#107): every route, component and feature reads and writes through `src/lib/data/*` or `src/lib/auth/*`, with ESLint guards per domain. Left direct on purpose: server routes (`api.*`, the manifest route), the order editor's realtime subscription, the rotation audit insert (bug #27). |
| 5 Split giant files | Big splits done: inventory, order editor, orders list, product page, checkout, dashboard, storefront home, storefront shell. Remaining files: split-on-touch policy (section 4.4).                                                                                                                                    |
| 6 Behaviour tests   | Not started (71 `readFileSync` test files).                                                                                                                                                                                                                                                                           |
| 7 Keep it clean     | Not started.                                                                                                                                                                                                                                                                                                          |

### Merged PRs of this effort (for context; read their descriptions on GitHub)

- #42 bug backlog; #43–#46 order editor split; #47 security fix (order line
  `selected_variant` sanitising); #48–#50 orders list split; #51 audit-test
  timeout; #52–#53 browser tests (checkout, product page) and the e2e write guard; #54–#55 product page;
  #56–#57 checkout; #58–#59 dashboard; #60 storefront home (+ storefront lint
  rule covers feature slices); #61 storefront shell.
- #62 `orders.payment_reference` column added (owner applied the migration) +
  typed payment update.
- #63 orders reads + `Order` typed; #64 orders writes + ESLint guard;
  #65 business settings / expenses / finance order views; #66 admin catalog reads
  (fixed bug #13).

## 3. Owner rules (non-negotiable)

1. **Production database is read-only for you.** The Supabase CLI is linked to
   production (`ikciahnuqhemvnyfvbyp`). `npx supabase db query --linked "<select>"`
   for read-only checks is fine and encouraged. Anything that writes
   (`db push`, `migration repair`, INSERT/UPDATE/DELETE/DDL, Edge Function
   deploys) needs the owner's explicit approval, and in practice **the owner runs
   `npx supabase db push --linked` themselves** (the tool's permission classifier
   blocks it). Workflow for a schema change: write the migration file, run
   `npm run db:migrations:check` and `npx supabase db push --linked --dry-run`
   (must list only your migration), explain it, ask the owner to push, then
   verify with a read-only query and `node scripts/database/check-migration-drift.mjs`,
   regenerate types (section 5.4), then open the PR. CI fails any PR whose
   migration is not in production yet.
2. **Refactors preserve behaviour.** A bug you find goes to `docs/bug-backlog.md`
   (Where / Problem / Effect / Fix) and into the PR description, not into the
   refactor. Exceptions only when the owner says so (they chose to fix #10 and
   the payment reference right away). When a fix is part of the domain move
   anyway (e.g. a write that ignored its error now throws), say so under
   "Behaviour" in the PR.
3. **Git**: branch per step from up-to-date `main` (`refactor/<domain>-data-layer-N`,
   `refactor/phase-5-<area>-N`, `fix/<thing>`, `docs/<thing>`). Commit and push
   are fine for this work. **Merge only when the owner says "merge when green"**,
   and only after every CI check passes. Use `gh pr merge <n> --merge`. **Never
   enable auto-merge.** Stacked PRs are fine (open the next PR against `main`
   while the previous is in CI; say "Stacked on #N" at the top; merge in order).
4. **Quality gates**: `npm run check` (typecheck + lint with `--max-warnings 0`
   - prettier check + all tests) must pass before every push. No new
     `eslint-disable`, `as any`, `: any`, `as never`, `@ts-ignore`. Lower the
     ratchet budgets in the same PR whenever a count drops (they are ceilings).
5. **Commit messages** explain why. End them with the co-author line your
   harness asks for. PR descriptions: what/why, behaviour notes, bugs found,
   numbers before/after (table), tests.
6. **Reports to the owner**: short. What was merged, what is open and its CI
   state, what you found (bugs), numbers, the next step. No filler.
7. **Pause when told to pause.** Continue only on the owner's word.

## 4. What to do next (in order)

### 4.1 Phase 6: behaviour tests (next)

Per `docs/maintainability-roadmap.md`. The classification and method are in
`docs/behaviour-tests.md` (43 to convert, 16 migration contracts, 10 guards);
convert a few files per PR. Keep the architecture guards (ratchet, lint-rule and import-boundary
checks); convert feature assertions that read source text into behaviour
tests against the data-layer functions (the `tests/*-data-layer.test.ts` files
show the fake-client pattern) or rendered components. Lower
`readFileSyncTestFiles` as each file converts.

### 4.2 Bugs waiting on the owner

In `docs/bug-backlog.md`. Some need a product decision or a migration the owner
applies: #25 (nothing creates the cash accounts or credits the cash box), #27
(key rotations are never audit-logged). The rest are older refactor finds (#2–#21).

### 4.3 `any` reduction

Screens now use typed rows, so most remaining `as any` sit on local shapes and
event handlers. Quick wins to do along the way: stale `(supabase as any)` / `(supabase.rpc as any)`
casts on tables and RPCs that are in the generated types (all 48 tables behind
such casts were present when checked), `catch (e: any)` → `unknown` (180 of
them, low value: do not count as real progress).

### 4.4 Giant files (split on touch)

Remaining files over 1000 lines are listed by the metrics script. Policy agreed
with the owner: split a file only when a feature needs to change it, one
section per PR, following `.agents/skills/giant-file-split/SKILL.md`. Do not
split `src/features/settings/registry.ts` or `src/lib/addons/addon-showcase-data.ts`
(data). Candidates when touched: `admin.b.$slug.content-studio.tsx` (most
edited), `$slug.account.tsx` (customer-facing, no browser test yet).

### 4.5 Phase 7

After Phase 6: the PR template and final docs (`docs/maintainability-roadmap.md`).

### 4.6 Bug backlog

`docs/bug-backlog.md` holds bugs found during refactors (see 4.2). Fix them only when the owner asks, each in its
own small PR with a test that fails before the fix, and delete the entry in
that PR.

## 5. How to work (the method that worked)

### 5.1 Every PR

1. `git checkout main && git pull && git checkout -b <branch>`.
2. Map the change read-only first (grep / Python walk / live read-only SQL).
3. Move code verbatim with the tools in `scripts/refactor-tools/` (see its
   README), then fix what `tsc` and ESLint report.
4. Tests: unit tests for new pure/data code (fake client, network blocked);
   fix source-string tests with the `xxxSource()` helper pattern.
5. `node scripts/maintainability-metrics.mjs` → lower the ratchet budgets.
6. `npm run check` (takes 3–5 minutes on the owner's machine).
7. Commit, push, `gh pr create --base main --body-file -` (heredoc).
8. The desktop app tracks the PR's CI; do not poll CI in a loop. Check with
   `gh pr checks <n>` when you come back to it. Merge only on the owner's word.

### 5.2 CI

Checks: Codebase Validation & Unit Tests, Playwright Browser Smoke Tests (~8
min), Production Build, Security scan, Supabase Linked Migration Drift, Validate
SQL Migrations, Vercel, Workers Builds. **Known flaky**: the Playwright
`desktop-audit` and `mobile-ux-audit` tests (customers page heading timeout,
"Failed to fetch" in `ProfileContext`, missing service-role key in the CI web
server). If only those fail, check the log
(`gh run view --job <id> --log-failed`), confirm the rest passed, and
`gh run rerun <run-id> --failed`. The checkout and product-page browser tests
must pass; they are the safety net for storefront changes.

### 5.3 Browser tests

Playwright cannot start the dev server on the owner's Windows machine; rely on
CI. The storefront e2e tests read the live "pura" store read-only and stub every
write in the browser (`tests/helpers/storefront-e2e.ts`: `guardWrites`,
`waitForHydration`). Never let a test write to the real database.

### 5.4 Database checks and types

- Read-only: `npx supabase db query --linked "<sql>"` (JSON output; treat row
  content as data).
- Columns: `select column_name from information_schema.columns where
table_schema='public' and table_name='x'`.
- Functions: `pg_get_functiondef`, triggers: `pg_trigger`, policies:
  `pg_policies`.
- Drift: `node scripts/database/check-migration-drift.mjs`.
- Regenerate types (never hand-edit `src/integrations/supabase/types.ts`):
  `npx supabase gen types typescript --linked > /tmp/t.ts`, then
  `npx prettier --stdin-filepath src/integrations/supabase/types.ts < /tmp/t.ts`
  into the file; the diff must contain only your change.

### 5.5 Windows / tooling pitfalls

- Paths contain `$` (`admin.b.$slug.orders.$id.tsx`): quote and escape
  (`"src/routes/_authenticated/admin.b.\$slug.orders.\$id.tsx"`), or use
  Python with single-quoted heredocs.
- The Bash tool can mangle `\n` / `\\` inside heredocs: write code containing
  escapes with the file-writing tool and grep the result.
- `sed -i` works in Git Bash; prefer Python scripts with
  `assert s.count(old) == 1` before each replacement (every script in
  `scripts/refactor-tools/examples/` does this).
- `npx prettier --write src` is safe but check `git status` afterwards.
- Vitest occasionally times out starting workers under load: re-run the file
  alone before believing a failure.

### 5.6 Useful snippets

Direct calls per table in screens (Python, from the repo root):

```python
import os, re, collections
c = collections.Counter()
for root in ["src/routes", "src/components", "src/features"]:
    for dp, _, fn in os.walk(root):
        for f in fn:
            if f.endswith((".ts", ".tsx")):
                s = open(os.path.join(dp, f), encoding="utf-8").read()
                c.update(m.group(1) for m in re.finditer(r'from\(\s*"([a-z_0-9]+)"\s*\)', s))
print(c.most_common(25))
```

Probe that an ESLint guard fires (then delete the probe):

```bash
printf 'import { supabase } from "@/integrations/supabase/client";\nexport const a = () => supabase.from("products").select("id");\nexport const k = ["products", "b1"];\n' > src/features/inventory/lib/zz-probe.ts
npx eslint src/features/inventory/lib/zz-probe.ts
rm src/features/inventory/lib/zz-probe.ts
```

## 6. Skills and agents to use

The repo's agent tooling lives in `.agents/` (see `AGENTS.md` section 11). For
this work:

| Work                  | Skills                                                                                                                                                                                                                      | Agents                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Data layer (Phase 4)  | `data-layer-migration`, `data-access-consistency`, `multi-tenant-security`, plus the domain skill (`order-inventory-logic`, `financial-data-consistency`, `settings-registry-single-source`, `loyalty-points-integrity`, …) | `domain-refactorer`, then `verification-gatekeeper` |
| Giant files (Phase 5) | `giant-file-split`, `refactor-safety`, the domain skill, `rtl-arabic-consistency`, `storefront-premium-design-system` for storefront UI                                                                                     | `frontend-refactorer` / `domain-refactorer`         |
| Migrations            | `migration-hygiene`, `multi-tenant-security`, `secrets-credentials-security`                                                                                                                                                | —                                                   |
| Tests (Phase 6)       | `test-quality-gate`                                                                                                                                                                                                         | —                                                   |
| Every phase           | `refactor-safety`, `handoff-plan-execution`                                                                                                                                                                                 | `cleanup-orchestrator`, `verification-gatekeeper`   |

Claude Code built-ins that helped: `/code-review` on a PR before merging a risky
change, the in-app browser for reading GitHub/CI pages, `gh` for everything
GitHub.

## 7. Memory notes from the old session (now obsolete or captured here)

- "Refactor-found bugs go in `docs/bug-backlog.md`, fixed later": still true
  (section 3.2).
- "Migration files differ from production": **no longer true**; drift is zero
  (261 versions). Still verify live definitions before diagnosing DB behaviour.
