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

| Domain                                                                                                                                                                                                                                                                                                   | Folder               | Enforced by ESLint                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public storefront catalog (products, categories, rankings, search, page data)                                                                                                                                                                                                                            | `storefront/`        | `src/routes/$slug.*`, `src/components/storefront/**`                                                                                                                                   |
| Admin orders: queue, order detail, finance views (dashboard, reports, COGS, reconciliation), writes, and the readers elsewhere (customer CRM stats, customer history, promo usage, inventory sales, export, review story, breadcrumb, command palette, inventory history)                                | `orders/`            | orders, dashboard, accounting, expenses, inventory, customers, discounts, returns, reviews and content-studio screens                                                                  |
| Business settings row: every admin reader (settings form, order editor, dashboard, reports, Pages, readiness checklist, packaging tab, customers, inventory, campaigns, content studio, discounts, returns, reviews, admin typography) and writes (settings form, Pages, store profile card, BOM switch) | `business-settings/` | orders, dashboard, accounting, expenses, inventory, customers, settings, discounts, returns, reviews and content-studio screens                                                        |
| Expenses: list and writes (expenses page, OpEx/COGS and reports tabs, dashboard)                                                                                                                                                                                                                         | `expenses/`          | orders, dashboard, accounting and expenses screens                                                                                                                                     |
| Admin catalog: products, variants, stock, packaging BOM and materials; reads (inventory, orders, expenses, dashboard) and writes (inventory, BOM editor, packaging tab)                                                                                                                                  | `catalog/`           | orders, dashboard, accounting and expenses screens; inventory, `components/inventory`, `components/products`                                                                           |
| Customers and saved addresses: admin list and profile, address manager, order editor, dashboard, pickers (push centre, loyalty), campaigns, export, command palette, breadcrumb; the shopper's own record and addresses (storefront account, checkout prefill, storefront context)                       | `customers/`         | customer screens, import, campaigns, export, push centre, loyalty dialog, command palette, app shell; storefront routes and slices; orders, dashboard, accounting and expenses screens |
| Brand row: settings profile, super admin list and edit                                                                                                                                                                                                                                                   | `brands/`            | settings feature and cards, Pages                                                                                                                                                      |
| Admin categories: overview with counts, every category, active pickers, export; writes (Categories page)                                                                                                                                                                                                 | `categories/`        | Categories page, inventory, customers-block screens (export)                                                                                                                           |
| Loyalty: program, tiers, accounts, ledger and summary (admin Loyalty page, the shopper's account section, checkout); program/tier saves and manual adjustments                                                                                                                                           | `loyalty/`           | Loyalty page and `components/loyalty/**`; storefront routes and slices                                                                                                                 |
| Promo codes: the Discounts page list and writes; the validation checkout and the order editor run                                                                                                                                                                                                        | `promo-codes/`       | Discounts page; storefront routes and slices; orders, dashboard, accounting and expenses screens                                                                                       |
| Incubators: partners, stock held, sales, payments; transfers, returns, sales, payments, price sync (Incubators page, batch transfer modal)                                                                                                                                                               | `incubators/`        | Incubators page and `components/incubators/**`                                                                                                                                         |
| Returns: the dashboard's pending count and the order editor's linked returns                                                                                                                                                                                                                             | `returns/`           | orders, dashboard, accounting and expenses screens                                                                                                                                     |
| Reporting: the dashboard's overview keys, incubator sales, catalog inquiries                                                                                                                                                                                                                             | `reporting/`         | orders, dashboard, accounting and expenses screens                                                                                                                                     |
| Admin route loader (favicon by slug), `useAdminStoreProfile`, Reports pages, returns screens, smaller domains                                                                                                                                                                                            | not yet              | —                                                                                                                                                                                      |

Usage:

```ts
const { data: products } = useQuery({
  ...storefrontQueries.products(brand),
  initialData: loaderData.products, // extra options are fine; a different queryFn is not
});
```
