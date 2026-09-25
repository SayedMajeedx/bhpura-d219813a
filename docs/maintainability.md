# Maintainability Baselines & Ratchet System

> Baseline recorded on **2026-09-24** on branch `chore/maintainability-ratchets` (HEAD commit `f3675702`).
> Corresponds to **Phase 0** of [`docs/maintainability-roadmap.md`](./maintainability-roadmap.md).

---

## 1. Overview & Philosophy

The maintainability ratchet is an automated guardrail ensuring that codebase quality only ever **improves** or stays steady—it can never silently regress.

Every number recorded in this document represents a **budget ceiling**. Budgets may only ever move **down**. Whenever a roadmap phase (Phase 1 through Phase 7) lowers a metric count (e.g., removing `as any`, replacing direct Supabase calls with typed queries, or splitting giant route files), the engineer **must lower the budget in [`tests/maintainability-ratchet.test.ts`](../tests/maintainability-ratchet.test.ts) in the same pull request**.

### Key Enforcements

1. **Ceilings are one-way ratchets**: Any pull request that increases `as any`, `: any`, `as never`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, direct Supabase calls, or `readFileSync` test files will fail the test suite immediately.
2. **Giant file freeze**: None of the 31 existing files with >1,000 lines may grow by even a single line past its recorded budget.
3. **New file line limit**: Any _new_ source file added to `src/**` must not exceed **600 lines**.
4. **Existing non-giant file limit**: Any existing file currently under 1,000 lines must never cross 1,000 lines.

---

## 2. How to Run the Tooling

### Run Maintainability Metrics Script

Prints a complete JSON breakdown of all scanned files, line counts, type escapes, and Supabase calls to `stdout`:

```bash
node scripts/maintainability-metrics.mjs
```

### Update Baseline File

Recalculates metrics and writes [`scripts/maintainability-baseline.json`](../scripts/maintainability-baseline.json):

```bash
node scripts/maintainability-metrics.mjs --write-baseline
```

### Run the Ratchet Test Suite

Executes the Vitest maintainability ratchet test:

```bash
npx vitest run tests/maintainability-ratchet.test.ts
```

### Run Full Repository Quality Gate

Executes type checking, linting, formatting check, and the entire test suite:

```bash
npm run check
```

---

## 3. Baseline Numbers (Recorded 2026-09-24)

| Metric                            | Baseline Ceiling (Budget) | Description                                                                    | Target Roadmap Phase      |
| :-------------------------------- | :-----------------------: | :----------------------------------------------------------------------------- | :------------------------ |
| **`as any`**                      |          **990**          | Unsafe type assertions bypass TypeScript safety.                               | Phase 3                   |
| **`: any`**                       |          **785**          | Explicit `any` type annotations on variables/parameters.                       | Phase 3                   |
| **`as never`**                    |          **40**           | Stale DB type workarounds (e.g. `supabase.from("x" as never)`).                | Phase 2 & Phase 3         |
| **`@ts-ignore`**                  |           **0**           | Suppressions strictly forbidden; must remain zero.                             | Enforced (Zero tolerance) |
| **`@ts-expect-error`**            |           **0**           | Suppressions strictly forbidden; must remain zero.                             | Enforced (Zero tolerance) |
| **`eslint-disable`**              |          **10**           | Inline ESLint suppressions across `src/**`.                                    | Freeze ceiling            |
| **Direct Supabase calls**         |          **392**          | Direct client calls (`from`, `rpc`, etc.) in `routes`/`components`/`features`. | Phase 4                   |
| **`readFileSync` test files**     |          **71**           | Brittle test files that read source files instead of testing behavior.         | Phase 6                   |
| **Files over 1,000 lines**        |          **31**           | Source files exceeding 1,000 lines (excluding generated files).                | Phase 5                   |
| **Max lines for NEW files**       |          **600**          | Strict ceiling on any newly introduced file in `src/**`.                       | Phase 0+                  |
| **Max lines for non-giant files** |         **1,000**         | Ceiling preventing medium files from becoming giant files.                     | Phase 0+                  |

---

## 4. Direct Supabase Calls Breakdown

> **Measurement note (2026-09-25):** the metric first missed calls behind a cast, `(supabase as any).from(...)`, often split over two lines. With the corrected pattern the Phase 0 baseline would have been higher: 406 instead of 317 on 2026-09-25 (`8ef1f289`). The ratchet budget was re-based once (195 -> 251, same code) and only moves down from there.

Direct Supabase client calls (`from`, `rpc`, `auth`, `storage`, `functions`, `channel`) located inside user-interface and route directories:

| Directory           | Direct Supabase Calls | Roadmap Objective                                               |
| :------------------ | :-------------------: | :-------------------------------------------------------------- |
| `src/routes/**`     |          305          | Migrate to server loaders, RPC functions, or typed query hooks. |
| `src/components/**` |          83           | Colocate queries into feature hooks/data-access modules.        |
| `src/features/**`   |           4           | Encapsulate within feature-scoped query modules.                |
| **Total**           |        **392**        | Move toward clean architecture with centralized queries.        |

---

## 5. The 31 Giant Source Files (>1,000 Lines)

Each file listed below has an individual ceiling recorded in `tests/maintainability-ratchet.test.ts`. None of these files may increase in length.

|  #  | File Path                                                           | Baseline Lines |
| :-: | :------------------------------------------------------------------ | :------------: |
|  1  | `src/routes/_authenticated/admin.b.$slug.inventory.tsx`             |     8,459      |
|  2  | `src/routes/_authenticated/admin.b.$slug.orders.$id.tsx`            |     5,022      |
|  3  | `src/routes/_authenticated/admin.b.$slug.orders.index.tsx`          |     3,456      |
|  4  | `src/routes/$slug.checkout.tsx`                                     |     2,809      |
|  5  | `src/features/settings/registry.ts`                                 |     2,616      |
|  6  | `src/routes/$slug.product.$id.tsx`                                  |     2,570      |
|  7  | `src/routes/_authenticated/admin.b.$slug.content-studio.tsx`        |     2,488      |
|  8  | `src/routes/_authenticated/admin.b.$slug.dashboard.tsx`             |     2,105      |
|  9  | `src/components/subscription/BrandSubscriptionHub.tsx`              |     1,972      |
| 10  | `src/routes/_authenticated/admin.b.$slug.export.tsx`                |     1,937      |
| 11  | `src/lib/addons/addon-showcase-data.ts`                             |     1,893      |
| 12  | `src/routes/_authenticated/admin.b.$slug.customers.tsx`             |     1,808      |
| 13  | `src/components/super/SuperPlansManager.tsx`                        |     1,728      |
| 14  | `src/routes/_authenticated/admin.b.$slug.team.tsx`                  |     1,715      |
| 15  | `src/addons/size-guides/components/admin/SizeGuideStudioPage.tsx`   |     1,703      |
| 16  | `src/routes/$slug.account.tsx`                                      |     1,560      |
| 17  | `src/routes/_authenticated/admin.b.$slug.incubators.tsx`            |     1,512      |
| 18  | `src/routes/_authenticated/admin.b.$slug.campaigns.tsx`             |     1,479      |
| 19  | `src/routes/_authenticated/admin.b.$slug.import.tsx`                |     1,463      |
| 20  | `src/components/reviews/ReviewStoryDialog.tsx`                      |     1,442      |
| 21  | `src/routes/_authenticated/admin.b.$slug.expenses.tsx`              |     1,431      |
| 22  | `src/routes/$slug.index.tsx`                                        |     1,360      |
| 23  | `src/components/inventory/InstagramImporterModal.tsx`               |     1,328      |
| 24  | `src/lib/public-api/public-api-router.server.ts`                    |     1,271      |
| 25  | `src/lib/instagram-ai-importer.ts`                                  |     1,262      |
| 26  | `src/routes/_authenticated/admin.brands.tsx`                        |     1,228      |
| 27  | `src/routes/_authenticated/admin.b.$slug.integrations.tsx`          |     1,202      |
| 28  | `src/routes/$slug.route.tsx`                                        |     1,197      |
| 29  | `src/routes/onboard.tsx`                                            |     1,094      |
| 30  | `src/routes/_authenticated/admin.b.$slug.customers.$customerId.tsx` |     1,084      |
| 31  | `src/routes/_authenticated/admin.b.$slug.pages.tsx`                 |     1,065      |

---

## 6. How to Lower Budgets During Refactoring

When working on a phase from [`docs/maintainability-roadmap.md`](./maintainability-roadmap.md):

1. **Implement your refactoring**: e.g. refactor a giant route file into modular components or replace `as any` with strict types.
2. **Re-run the metrics script**:
   ```bash
   node scripts/maintainability-metrics.mjs --write-baseline
   ```
3. **Lower the budget in [`tests/maintainability-ratchet.test.ts`](../tests/maintainability-ratchet.test.ts)**:
   - Update `BUDGETS` with the new lower ceiling.
   - For giant files, update `GIANT_FILES_BUDGETS[filePath]` with the new lower line count.
   - If a file drops below 1,000 lines, decrement `filesOver1000`.
4. **Verify acceptance**:
   ```bash
   npm run check
   ```
5. **Commit the lowered budget in the exact same PR** as the refactoring.
