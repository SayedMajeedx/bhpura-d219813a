## What and why

<!-- What changes, and why. Link the issue or the bug-backlog entry (docs/bug-backlog.md) it fixes. -->

## Behaviour

<!-- What a merchant, shopper or admin will notice. "No behaviour change" for refactors. -->

## Checklist

- [ ] `npm run check` passes (typecheck, lint with `--max-warnings 0`, Prettier, all tests).
- [ ] Ratchet budgets in `tests/maintainability-ratchet.test.ts` were not raised; lowered where a count dropped (`node scripts/maintainability-metrics.mjs`).
- [ ] New logic is tested by running it (pure functions, rendered components, data-layer fakes), not by reading source text. See `docs/behaviour-tests.md`.
- [ ] Reads and writes go through `src/lib/data/` (no new direct Supabase calls in routes, components or features).
- [ ] Core code does not import `@/addons/*`; UI uses semantic design tokens.
- [ ] Arabic (RTL) and English (LTR) checked.
- [ ] Screenshots attached for UI changes.
- [ ] Database changes: an additive migration in `supabase/migrations/`, `npm run db:migrations:check` passes, the owner reviewed the `--dry-run` and applied it before this PR, and types were regenerated. No agent writes to production.
- [ ] Bugs found but not fixed here are recorded in `docs/bug-backlog.md`.
- [ ] `AGENTS.md` (and the relevant `docs/` file) updated if architecture, commands or conventions changed.
