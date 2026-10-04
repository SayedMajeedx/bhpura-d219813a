# Vertical fit audit: what a store sees that its vertical does not use

A store's vertical decides its **modules** (`src/lib/verticals/registry.ts`: stock, shipping, incubators, packaging, returns, bookings and the tailoring ones). A screen that only makes sense for goods (a parcel to prepare, a courier, incubator sales) must be gated by the module it depends on, never by the vertical's name, so a store that overrides a module by hand is still right.

## The rules

1. **Gate by module, not by vertical.** `useAdminStoreProfile(brandId).profile.modules` in the admin, `useStoreModules()` on the storefront. `isServicesProfile(modules)` is the one definition of a services store.
2. **Data stays reachable.** A count, a tab or a row for something the store does not use is left out only while it is empty or zero. An order that is still there, a figure that is not zero, keeps its place (`shows()` in the reports overview, `orderQueueTabs`).
3. **Wording follows what the store sells.** A services store has bookings, appointments and services, not orders to pack, parcels or products.
4. **A change of vertical never deletes data.** It lists what stays behind (`planLeftovers`, shown in the change dialog) so the merchant can tidy it.

## Fixed (the services store, "Aurora")

| Where                   | Was                                                                                      | Now                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard action strip  | Two appointment orders counted as "Orders awaiting fulfillment ... waiting for dispatch" | The finance rows now carry `fulfillment_method` and the booking, so appointments are staged as appointments; a services store gets "Appointments to complete"                                                                |
| Dashboard header        | "Collected order and incubator sales ... storefront orders only"                         | Names incubators only when the module is on; services: "Money collected from bookings and orders"                                                                                                                            |
| Dashboard tab           | "Stock & Customer Alerts"                                                                | "Customer Alerts" without the stock module                                                                                                                                                                                   |
| Orders list tabs        | "To prepare" and "With courier" always                                                   | Left out while empty for a services store                                                                                                                                                                                    |
| Orders header           | "packing, or courier dispatch"                                                           | Bookings and payments, and the appointments that are due                                                                                                                                                                     |
| Menu and catalog header | "Inventory", "Inventory & Products", "Add Product"                                       | "Services", "Add Service"                                                                                                                                                                                                    |
| Reports overview        | Incubator, packaging and shipping rows always                                            | Only when the module is on or the figure is not zero                                                                                                                                                                         |
| Set-up checklist        | "Define shipping zones", "Publish return policy"                                         | Not asked; "terms and cancellation policy" instead                                                                                                                                                                           |
| Change of vertical      | Silent about what stays                                                                  | "What stays behind" in the dialog (module overrides, goods or services left in the catalog, open orders and bookings the new vertical has no screen for, incubators, returns, delivery settings, a goods-only advance scope) |

## Still to do (found, not yet fixed)

Each is a small change of the same kind; fix in its own PR with a test.

- **Quick actions and the command palette** say "New Product" and "Products & Inventory" (`src/components/os/os-quick-actions.tsx`, `src/components/spotlight-command-palette.tsx`); they need the store's profile.
- **Accounting** (`ExpensesOpExCogsTab`, `FinancialReportsTab`, `VendorsPurchaseOrdersTab`): incubator, packaging and COGS sections show whatever the store is.
- **Dashboard KPIs** (`primaryKpisFor`): cost of goods and margin make little sense for a store that sells time.
- **Order batch actions and the order page's fulfillment panel** (`OrderBatchActionsBar`, `OrderFulfillmentSection`): courier and dispatch actions are offered on appointment orders.
- **Notification templates** (`TemplatesGroup`): shipping and courier messages are listed for every store.
- **Settings**: the return policy editor, loyalty's free-shipping tier option and the integrations page's couriers are reachable from a services store.
- **Import and export pages** mention incubators and stock columns.
- **The mobile merchant app** has its own dashboard copy (`apps/boutq-os-mobile`) and was not audited.

## Adding a surface

Ask which module the surface depends on, gate it on that module, keep it visible when it holds data, and add the services wording beside the goods wording rather than replacing it. `tests/services-admin-surfaces.test.tsx` is the pattern.
