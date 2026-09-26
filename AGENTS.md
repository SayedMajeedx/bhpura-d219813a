# AGENTS.md — Boutq OS Architecture & Contributor Guide

Welcome! This document is the primary entry point for AI agents and human engineers working on Boutq OS (`bhpura-d219813a`). Every statement here is verified against the codebase as of September 2026.

---

## 1. What Boutq Is

Boutq is a multi-tenant e-commerce and brand operations platform for GCC boutique brands.

- **Tenants / Brands**: Each merchant owns a brand scoped by `brand_id` and unique `slug` (e.g. `/pura`).
- **Surfaces**:
  - **Storefront (`src/routes/$slug.*.tsx`)**: Public shopping experience. Supports bilingual (AR/EN), RTL-first layout, currency formatting, and multiple sales modes (`storefront_mode`: `ecommerce`, `catalog_only`, `inquiry`).
  - **Admin Panel (`src/routes/_authenticated/admin.b.$slug.*.tsx`)**: Authenticated back-office for catalog, inventory, orders, marketing, expenses, team, and settings.
  - **Super Admin (`src/routes/_authenticated/admin.super.*.tsx`)**: Platform operations, tenant provisioning, system health, and billing plans.
- **Storefront Engine (V1 vs V2)**: Governed by `storefront_design_version` (1 or 2) in `business_settings`.
  - V1: Classic stable layout with 1:1 product cards.
  - V2: Premium agency-grade experience with 3:4 cards, cinematic hero (`HeroV2`), quick add, color swatches, and vertical design presets (`editorial`, `fresh`, `tech`). See [`docs/storefront-architecture.md`](./docs/storefront-architecture.md).

---

## 2. Tech Stack & Runtimes

- **Web**: React 19.2, TanStack Start (Vinxi / Vite), Tailwind CSS v4, Lucide icons, Radix UI primitives.
- **Mobile (`apps/boutq-os-mobile/`)**: React 19.1, React Native 0.81, Expo 54, React Navigation.
- **Runtime Host**: Cloudflare Workers (SSR + edge functions) with Cloudflare R2 object storage.
- **Backend & Database**: Supabase (PostgreSQL 15, RLS tenant isolation, Auth, Storage, Deno Edge Functions).

---

## 3. Core Commands & Quality Gates

Run these commands locally before submitting any pull request:

```bash
npm run check               # Runs typecheck + lint + format:check + test
npm run typecheck           # TypeScript compiler check (tsc --noEmit)
npm run lint                # ESLint with --max-warnings 0 (zero tolerance)
npm run format:check        # Prettier formatting check (fix with: npm run format)
npm test                    # Vitest full test suite execution
npm run db:migrations:check # Verifies migration sequencing and integrity
node scripts/maintainability-metrics.mjs # Architecture metrics & debt ratchet check
```

- **Mobile typecheck**: `cd apps/boutq-os-mobile && npm run typecheck`

---

## 4. Directory Map

| Path                    | Purpose                           | Key Guidance                                                                    |
| :---------------------- | :-------------------------------- | :------------------------------------------------------------------------------ |
| `src/routes/`           | TanStack Start file-based routing | `$slug.*` = storefront; `_authenticated/admin.b.$slug.*` = admin.               |
| `src/features/`         | Modular feature slices            | E.g. `src/features/settings/` owns settings registry & tab forms.               |
| `src/components/`       | Reusable UI components            | Subdivided into `storefront/`, `admin/`, `orders/`, `inventory/`, `ui/`.        |
| `src/lib/`              | Domain logic, helpers & RPCs      | Pure logic, formatting, Supabase client, billing, vocabulary, and APIs.         |
| `src/addons/`           | Modular industry add-ons          | E.g. `size-guides`, `fit-passport`, `abaya-pack`. Must NOT be imported by core. |
| `supabase/functions/`   | Deno Edge Functions               | `user-management`, `send-order-email`, `brand-ai-copilot`.                      |
| `supabase/migrations/`  | Database SQL migrations           | Sequential, additive-only migration scripts.                                    |
| `apps/boutq-os-mobile/` | React Native merchant app         | Expo mobile client for iOS and Android.                                         |
| `tests/`                | Vitest suites                     | Unit, regression, behavior, and architectural ratchet guardrails.               |
| `docs/`                 | Engineering documentation         | Active architecture docs, runbooks, and roadmap. Index in `docs/README.md`.     |
| `.agents/`              | Agent skills & guardrails         | Subagent definitions, domain skills, and design system rules.                   |

---

## 5. "Where Do I Change X?" (Quick Reference)

- **Products & Catalog**:
  - Admin management: `src/features/inventory/` (`components/` for the product list, product editor and variant table; `hooks/` for data and mutations; `lib/` for pure, unit-tested rules). The route `src/routes/_authenticated/admin.b.$slug.inventory.tsx` only loads data and picks the tab. Shared inventory UI: `src/components/inventory/`
  - Storefront product page: `src/routes/$slug.product.$id.tsx` (composition) + `src/features/product-page/` (option rules, pricing, cart line, gallery, pickers)
  - Cards & presentation: `src/components/storefront/product-card.tsx` (`ProductCard` / `ProductCardV2`)
  - Variant axes & SKUs: `src/lib/variant-axes.ts`, `src/lib/variant-sku-utils.ts`, `src/lib/variant-i18n.ts`
- **Orders & Checkout**:
  - Admin order editor: `src/features/orders/` (`components/` for the cards, dialogs and line editor; `hooks/` for data, save, payment, promo and line actions; `actions/` for print/share and status changes; `lib/` for pure, unit-tested rules such as totals, save payloads and change detection). The route `src/routes/_authenticated/admin.b.$slug.orders.$id.tsx` holds the editor state and layout. Shared order UI: `src/components/orders/`
  - Storefront checkout: `src/routes/$slug.checkout.tsx` (composition) + `src/features/checkout/` (validation, `place_storefront_order` args, hooks, sections); `src/routes/$slug.thank-you.$orderId.tsx`
  - Admin dashboard: `src/features/dashboard/` (`useDashboardData`, pure metrics in `lib/dashboard-metrics.ts`, KPI cards)
  - State machine & returns: `src/lib/order-workflow.ts`, `src/lib/returns.functions.ts`
- **Storefront Hero & Media**:
  - Components: `HeroBanner` in `src/features/storefront-home/components/` (V1), `src/components/storefront/HeroV2.tsx` (V2). Home page rules: `src/features/storefront-home/lib/home-products.ts`; storefront shell (settings normaliser, head, theme, footer): `src/features/storefront-shell/`
  - Resolvers & aspect logic: `src/lib/hero-media.ts`, `src/lib/media-aspect.ts`
  - Admin banner configuration: `src/features/settings/` (storefront tab, group `home_hero`)
- **Store Settings & Identity**:
  - Single Source of Truth: `src/features/settings/registry.ts` (`SETTINGS_REGISTRY`)
  - Settings UI: `src/routes/_authenticated/admin.b.$slug.settings.tsx`, `src/features/settings/`
  - Database persistence: `business_settings` and `brands`
- **Addons & Vertical Packs**:
  - Feature implementations: `src/addons/<addon-name>/`
  - Extension points: Mount via `<AddonSlot slot="..." />`
  - Presets & metadata: `src/lib/addons/addon-registry.ts`, `src/lib/addons/starter-packs.ts`

---

## 6. Core Domain Concepts

1. **Store Verticals & Addon Packs** (`src/lib/addons/addon-registry.ts`): Stores belong to business verticals (`fashion`, `abaya`, `perfume`, `coffee`, `jewelry`, etc.). Verticals determine starter packs, default design presets, and category templates.
2. **Dynamic Variant Option Axes** (`src/lib/variant-axes.ts`): Variants store options in generic columns (`size`, `color`, `fabric`, `option_four`, `option_five`) whose meaning depends on the store (a roastery keeps the roast level in `color`). **Never label or render an option by its column name**: resolve labels and swatch-vs-chip rendering with `useVariantAxes` / `describeVariantAxes`, which combine the store vertical, installed addon packs and per-product label overrides.
3. **Hero Media Pipeline** (`src/lib/hero-media.ts`, `docs/media-video-pipeline.md`): Media items can be image or video. Videos are transcoded in-browser using WebCodecs + `mediabunny` into faststart MP4s. Resolvers choose optimal dimensions and crop focal points.
4. **Store Vocabulary** (`src/lib/store-vocabulary.ts`): Terminology adapts per vertical (e.g. "Abayas" vs "Products", "Tailoring" vs "Customization").
5. **Storefront Modes** (`src/lib/storefront-mode.ts`): Brands can operate as full e-commerce (`ecommerce`), browsing only (`catalog_only`), or WhatsApp/contact inquiries (`inquiry`).

---

## 7. Architecture & Coding Rules

- **Vanilla Core Isolation**: Core files (`src/routes`, `src/components`, `src/lib`) **must never import from `@/addons/*` directly**. Enforced by ESLint restricted imports. Addons mount via `<AddonSlot />` or `@/lib/addons/*` bridge data.
- **Design Tokens**: Never hardcode hex colors or arbitrary pixel radii. Use semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`). Follow [`.agents/rules/AGENTS.md`](./.agents/rules/AGENTS.md).
- **RTL & Bilingual**: All UI components must support Arabic (RTL) and English (LTR). Use logical margins/padding or direction-aware flex layouts.
- **Shared Resolvers Over Surface-Specific Hacks**: Never duplicate resolution logic in a route; place canonical logic in `src/lib/` (e.g., `resolveHeroMedia`, `calculateStock`).
- **Data Access Layer** (`src/lib/data/`, see its README): reads and writes live in one module per domain with `selects.ts` (column lists), `keys.ts` (query-key factories), `queries.ts` (fetchers + `queryOptions`) and `types.ts`. Screens call `useQuery(xxxQueries.foo(...))` and never build keys or queries by hand. Migrated so far: the public storefront catalog (`storefront/`); admin orders reads + writes (`orders/`, incl. finance, COGS and reconciliation views); `business-settings/`; `expenses/`; admin catalog reads + writes (`catalog/`: products, variants, stock, BOM, packaging, add-ons); customers and saved addresses, admin and storefront (`customers/`); settings writes (`business-settings/`, `brands/`). ESLint `no-restricted-syntax` enforces them on the storefront routes and slices, and on the orders, dashboard, accounting, expenses, inventory, customers and settings screens (no direct `from(...)` for those tables, no hand-built keys). Also `returns/` and `reporting/` for the dashboard, admin `categories/`, `loyalty/`, `promo-codes/`, `incubators/`, `message-templates/` and `profiles/` (the route guards' caller profile). `returns/` covers the admin returns screens too; `push/` the push centre; `notification-recipients/` the admin alert recipients; `media-optimizer/` the super admin video re-optimizer; `abandoned-carts/` the admin abandoned-carts screen; `integrations/` the integrations screen; `super-admin/` the super admin's platform screens; `import-export/` the import and export history; `checkout/` the storefront checkout's calls; `addons/` the addon data core screens read; `activity-logs/` the activity log; `system-settings/` the platform settings row; `branches/` a brand's branches (admin and checkout pickup); `reviews/` order reviews (admin and public); `brands/` the brand lookups (admin route guard, switcher, onboarding, storefront host); `reporting/` the Reports pages (one overview cache shared with the dashboard). `accounting/` covers the expenses page's cash accounts, vendors and purchase orders tabs. Still direct: the remaining small reads the metric lists. Method: [`.agents/skills/data-layer-migration`](./.agents/skills/data-layer-migration/SKILL.md); status and next steps: [`docs/agent-handoff.md`](./docs/agent-handoff.md).

---

## 8. Database & Security Rules

- **Production Database**: Linked to remote Supabase. Treat as **read-only** by default (`npx supabase db query --linked "<select>"` is fine). Never execute `db reset`, `db push`, `migration repair`, or unvetted DDL; the owner applies migrations (`npx supabase db push --linked`) after reviewing a `--dry-run`.
- **Row Level Security (RLS)**: Every multi-tenant table enforces RLS. Security functions live in Postgres (`can_access_brand`, `is_brand_owner`, `is_super_admin`). Always scope queries by `brand_id`.
- **Additive Migrations**: Schema changes must be backward-compatible, sequential SQL scripts in `supabase/migrations/`. Check with `npm run db:migrations:check`. Local and production history match (zero drift); CI fails a PR whose migration is not applied yet, so apply (owner) → verify → regenerate types → open the PR.

---

## 9. Maintainability Ratchets & Quality Gates

Maintained in [`tests/maintainability-ratchet.test.ts`](./tests/maintainability-ratchet.test.ts) (Phase 0):

- **Ceilings move only down**: `as any`, `: any`, `as never`, `@ts-ignore`, `eslint-disable`, direct Supabase calls, and brittle `readFileSync` test files are strictly capped. Increasing any count breaks CI.
- **Giant File Freeze**: Existing files $>1,000$ lines cannot grow. New files must stay under **600 lines**.
- **Behavior Testing**: Avoid writing brittle tests that inspect source strings via `readFileSync`. Test logic by invoking exported functions or rendering components.

---

## 10. Known Pitfalls

- **Vitest Memory & Worker Timeouts**: Full test suite (`npx vitest run`) executes 1,000+ tests. Run specific files during development: `npx vitest run tests/<file>.test.ts`.
- **JSDOM Stubs**: Browser globals like `scrollIntoView`, `matchMedia`, and `window.open` are stubbed in [`tests/setup.ts`](./tests/setup.ts). Add mocks there if needed.
- **Windows vs POSIX Paths**: In scripts, always normalize backslashes (`path.replace(/\\/g, "/")`). Avoid unescaped `$slug` variables in PowerShell commands.
- **Generated Files**: **Never manually edit** `src/routeTree.gen.ts` (generated by TanStack Router) or `src/integrations/supabase/types.ts` (generated by Supabase CLI).

---

## 11. Project Agents & Skills

Specialized knowledge and review workflows live in [`.agents/`](./.agents/):

| Agent / Skill                          | When to Use                            | Path                                                                                                                     |
| :------------------------------------- | :------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **`AGENTS.md` (Design Rules)**         | Mandatory for any UI/styling edit      | [`.agents/rules/AGENTS.md`](./.agents/rules/AGENTS.md)                                                                   |
| **`cleanup-orchestrator`**             | Refactoring workflow coordination      | [`.agents/agents/cleanup-orchestrator.md`](./.agents/agents/cleanup-orchestrator.md)                                     |
| **`verification-gatekeeper`**          | Verifying diffs for zero regression    | [`.agents/agents/verification-gatekeeper.md`](./.agents/agents/verification-gatekeeper.md)                               |
| **`handoff-plan-execution`**           | Executing roadmap and handoff plans    | [`.agents/skills/handoff-plan-execution/SKILL.md`](./.agents/skills/handoff-plan-execution/SKILL.md)                     |
| **`refactor-safety`**                  | Preserving behavioral invariants       | [`.agents/skills/refactor-safety/SKILL.md`](./.agents/skills/refactor-safety/SKILL.md)                                   |
| **`multi-tenant-security`**            | Modifying RLS, tenant filters, or auth | [`.agents/skills/multi-tenant-security/SKILL.md`](./.agents/skills/multi-tenant-security/SKILL.md)                       |
| **`settings-registry-single-source`**  | Modifying brand or store settings      | [`.agents/skills/settings-registry-single-source/SKILL.md`](./.agents/skills/settings-registry-single-source/SKILL.md)   |
| **`storefront-premium-design-system`** | Upgrading storefront UI and UX         | [`.agents/skills/storefront-premium-design-system/SKILL.md`](./.agents/skills/storefront-premium-design-system/SKILL.md) |
| **`order-inventory-logic`**            | Changing orders, stock, or ledger      | [`.agents/skills/order-inventory-logic/SKILL.md`](./.agents/skills/order-inventory-logic/SKILL.md)                       |
| **`financial-data-consistency`**       | Modifying accounting, COGS, expenses   | [`.agents/skills/financial-data-consistency/SKILL.md`](./.agents/skills/financial-data-consistency/SKILL.md)             |
| **`migration-hygiene`**                | Writing or testing database migrations | [`.agents/skills/migration-hygiene/SKILL.md`](./.agents/skills/migration-hygiene/SKILL.md)                               |
| **`data-layer-migration`**             | Moving a domain into `src/lib/data/`   | [`.agents/skills/data-layer-migration/SKILL.md`](./.agents/skills/data-layer-migration/SKILL.md)                         |
| **`giant-file-split`**                 | Splitting files over 1000 lines        | [`.agents/skills/giant-file-split/SKILL.md`](./.agents/skills/giant-file-split/SKILL.md)                                 |

Continuing the maintainability roadmap? Start with [`docs/agent-handoff.md`](./docs/agent-handoff.md) (status, owner rules, next steps, method) and the helpers in [`scripts/refactor-tools/`](./scripts/refactor-tools/README.md).
