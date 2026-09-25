---
name: data-layer-migration
description: "Use when moving a domain's Supabase reads/writes into src/lib/data/<domain> (roadmap Phase 4) or removing `as any` at data boundaries. The recipe the orders, finance and catalog migrations followed (PRs #63-#66)."
---

# Data layer migration (one domain per PR)

Goal: every screen reads and writes a domain through `src/lib/data/<domain>/`,
so one cache key is always filled by one fetcher with one column list, every
write refreshes exactly the keys it affects, and row types come from the
generated schema instead of `any`. Read `src/lib/data/README.md` first.

## 1. Map before you move (read-only)

- List every `supabase.from("<table>")` / `.rpc(` for the domain with file,
  operation, columns and **the queryKey it fills**. A Python walk over `src/`
  with a regex is fastest (see `docs/agent-handoff.md`).
- For every key filled by more than one reader, compare column lists, sort
  order, filters and error handling. **Different shapes under one key are bugs**
  (whichever screen loads first decides what the others see). Found so far:
  storefront categories, dashboard/reports settings and orders, expenses tabs,
  catalog sort orders. Check `staleTime` to judge impact (a 60 s stale time
  keeps the wrong shape for up to a minute).
- Grep for hand-built keys too: `["orders", brandId, scope]` built from
  variables escapes string searches (this broke the courier optimistic update
  once). Search `\[\s*"<key>"` and look at every `getQueryData` /
  `setQueryData` / `setQueriesData`.
- Check the generated types: `grep -n "^      <table>: {" src/integrations/supabase/types.ts`.
  RPCs called with `(supabase.rpc as any)` are usually typed already.

## 2. Build the module

`src/lib/data/<domain>/{selects,types,keys,queries,mutations,index}.ts` (or one
`index.ts` for a small domain):

- **Selects**: named string constants, one per use. Let Supabase infer the row
  type from the literal (`Awaited<ReturnType<typeof fetchX>>[number]`); if the
  inferred type matches your declared type without casts, the compiler is now
  checking the column list against the schema.
- **Keys**: start with the domain and brand (`["orders", brandId, …]`), so one
  `invalidateQueries({ queryKey: xKeys.all(brandId) })` refreshes everything of
  the brand. Put lists and details on separate branches when anything does
  in-place list updates (`setQueriesData` must only ever see arrays). Keep
  existing key values when many invalidations already use them (catalog did).
- **Fetchers**: always `.eq("brand_id", brandId)` (on top of RLS), throw on
  error unless the old behaviour deliberately swallowed it (then document why,
  e.g. BOM reads as "none"). One sort order per list; a screen needing another
  order sorts its own copy with `useMemo`.
- **`xQueries.*`**: `queryOptions({ queryKey, queryFn, staleTime, enabled })`.
  Screens spread them and may add options (`enabled`, `refetchOnWindowFocus`,
  `select`, `initialData`) but **never override `queryFn`**.
- **Mutations**: typed with `TablesInsert/TablesUpdate<"table">` (use
  `satisfies` for literals), scoped by `brand_id`, throw on error, plus an
  `invalidateX(qc, brandId)` helper. RPCs that callers use as "try, then fall
  back" return the error instead of throwing.
- No side-effect writes inside a shared fetcher (the packaging tab's
  auto-sync moved to a one-shot `useEffect`).
- `src/lib` must not import from `src/features`; move shared shapes into the
  data module and re-export them from the feature's `types.ts`.

## 3. Move the callers

- Replace each `useQuery({ queryKey: …, queryFn: … })` with
  `useQuery(xQueries.foo(brandId))` (spread + extra options when needed).
- Replace writes and every hand-built key (`["x", brandId]`, old
  `queryKeys.*` shapes) with the module's functions and key factories. Point
  `src/lib/query-keys.ts` entries at the new factories (same values) and delete
  shapes nobody uses.
- When a typed row replaces `any`, fix every error properly: nullable params
  (`Order | null` where the hook already null-checks), draft types
  (`Partial<Row> & Pick<Row, …>`), `Pick<Row, …>` for helpers that read a few
  fields. Reads of columns that do not exist show up here: **verify against the
  live schema** (`npx supabase db query --linked "select column_name from
information_schema.columns where table_name='x'"`) before removing them, and
  report them.
- A behaviour difference you cannot avoid (e.g. a previously swallowed error now
  surfaces, a list now sorted) goes in the PR's "Behaviour" section. Anything
  that is a real bug fix beyond that goes to `docs/bug-backlog.md` instead.

## 4. Guard it

Extend the `no-restricted-syntax` block in `eslint.config.js` for the migrated
screens: forbid `from("<table>")` and array keys starting with the domain's key
names. Prove it fires: write a probe file that breaks both rules, run ESLint on
it, delete it, then `npx eslint . --max-warnings 0`.

## 5. Test and ratchet

- `tests/<domain>-data-layer.test.ts` with a fake Supabase client (record
  table, select, filters, writes; answer from `respond`) and
  `vi.stubGlobal("fetch", …throw…)` so nothing reaches a real database. Cover:
  one key per shape, brand scoping, sort order, error paths, invalidation.
  Copy `tests/finance-data-layer.test.ts`.
- Source-string tests that looked for the old code: point them at the new
  functions, keep their intent, and never add `readFileSync` to a test file that
  did not already use it (the ratchet counts files).
- `node scripts/maintainability-metrics.mjs`, then lower `asAny`, `colonAny`,
  `directSupabaseCalls` (and any shrunk giant-file budget) in
  `tests/maintainability-ratchet.test.ts`.
- Update the status table in `src/lib/data/README.md`.
- `npm run check` must pass.
