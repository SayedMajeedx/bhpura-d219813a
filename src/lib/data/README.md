# Data layer

One folder per domain. Screens never call `supabase.from(...)` for a migrated
domain; they use the domain's query options or fetchers.

```
src/lib/data/<domain>/
  selects.ts   named column lists, one per use (cards, detail, search …)
  types.ts     the row type each select returns
  keys.ts      query-key factories
  queries.ts   fetchers + `queryOptions` factories (`<domain>Queries`)
  mutations.ts writes and the exact keys each one invalidates (when needed)
  index.ts     re-exports
```

## Rules

1. **One key, one fetcher, one column list.** Two screens may share a cache key
   only by using the same query options. Never pass your own `queryFn` for a
   shared key: that is how the storefront categories cache ended up filled
   with three different column lists.
2. **Every argument that changes the result is in the key** (brand, ids,
   limits, filters, search term).
3. **Tenant scope is explicit.** Every fetcher filters by `brand_id` (or passes
   the brand slug to an RPC that resolves it server-side). Keys start with the
   brand, e.g. `["storefront", slug, …]`, so one call refreshes a whole store.
4. **Mutations invalidate only the keys they affect**, using the key factories.
5. **Columns must exist.** Selects are plain string literals so Supabase types
   them; check new columns against `src/integrations/supabase/types.ts`. A
   missing column fails the whole request (see `selects.ts`).
6. **Test fetchers by behaviour** with a fake client, never against a real
   database. See `tests/storefront-data-layer.test.ts` (it also blocks `fetch`).

## Status

| Domain                                                                                                 | Folder               | Enforced by ESLint                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------- | ---------------------------------------------------- |
| Public storefront catalog (products, categories, rankings, search, page data)                          | `storefront/`        | `src/routes/$slug.*`, `src/components/storefront/**` |
| Admin orders: queue, order detail, finance views (dashboard, reports, COGS, reconciliation) and writes | `orders/`            | orders, dashboard, accounting and expenses screens   |
| Business settings row (settings form, order editor, dashboard, reports)                                | `business-settings/` | orders, dashboard, accounting and expenses screens   |
| Expenses: list and writes (expenses page, OpEx/COGS and reports tabs, dashboard)                       | `expenses/`          | orders, dashboard, accounting and expenses screens   |
| Admin products and inventory, customers, settings                                                      | not yet              | —                                                    |

Usage:

```ts
const { data: products } = useQuery({
  ...storefrontQueries.products(brand),
  initialData: loaderData.products, // extra options are fine; a different queryFn is not
});
```
