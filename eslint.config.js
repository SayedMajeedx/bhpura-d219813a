import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      ".wrangler",
      ".worktrees",
      "src/routeTree.gen.ts",
      "worker-configuration.d.ts",
      ".codex-*/**",
      "**/.*codex*/**",
      ".temp/**",
      "supabase/.temp/**",
      "node_modules/**",
      // Gitignored local SDK/toolchain caches (e.g. an Android SDK for the
      // Expo mobile apps) that some machines have on disk. They're never
      // part of the repo, so CI never sees them, but ESLint's flat config
      // doesn't consult .gitignore on its own — without this, a machine
      // that happens to have one cached lints thousands of vendor files.
      ".local-tools/**",
      // Gitignored local scratch output (verification scripts, screenshots).
      "scratch/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      // Fast Refresh export shape is development-only guidance. The project
      // intentionally colocates context hooks and UI variants with providers.
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/addons/**",
      "src/lib/addons/**",
      "src/routes/$slug.size-guide.tsx",
      "src/routes/_authenticated/admin.b.$slug.size-guides.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/addons",
                "@/addons/*",
                "../addons/*",
                "../../addons/*",
                "../../../addons/*",
              ],
              message:
                "Core files must remain vanilla! Do not import directly from `@/addons/*`. Use <AddonSlot />, add-on extension points, or '@/lib/addons/*' presets bridge instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Phase 4 data layer: the public storefront reads its catalog only through
    // `@/lib/data/storefront`, so one cache key always holds one column list.
    // Admin screens are not covered yet (their domains migrate later). The
    // storefront feature slices hold code split out of the $slug routes.
    files: [
      "src/routes/$slug.*",
      "src/components/storefront/**",
      "src/features/storefront-home/**",
      "src/features/product-page/**",
      "src/features/checkout/**",
      "src/features/storefront-shell/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(products|product_variants|categories|customization_options)$/]",
          message:
            "Storefront catalog reads go through `@/lib/data/storefront` (storefrontQueries / fetchers), not direct Supabase calls.",
        },
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(customers|customer_addresses)$/]",
          message:
            "The shopper's own customer record and addresses go through `@/lib/data/customers` (ownCustomerQueries, fetchOwnCustomer and the customer mutations).",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value=/^get_storefront_(page_data|best_sellers|trending)$/]",
          message:
            "Use the fetchers in `@/lib/data/storefront` for storefront page data and rankings.",
        },
        {
          selector:
            "CallExpression[callee.expression.property.name='rpc'][arguments.0.value=/^get_storefront_(page_data|best_sellers|trending)$/]",
          message:
            "Use the fetchers in `@/lib/data/storefront` for storefront page data and rankings.",
        },
      ],
    },
  },
  {
    // Admin orders and finance data layer: orders, expenses and business
    // settings are read and written through `@/lib/data/{orders,expenses,
    // business-settings}`, with their key factories. Hand-built keys are how two
    // readers silently missed the cache after the order keys moved, and how the
    // dashboard and reports filled one key with different column lists.
    files: [
      "src/features/orders/**",
      "src/components/orders/**",
      "src/routes/_authenticated/admin.b.$slug.orders.*",
      "src/features/dashboard/**",
      "src/components/accounting/**",
      "src/routes/_authenticated/admin.b.$slug.expenses.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(orders|order_items|expenses|business_settings|products|product_variants|product_bom_items|packaging_materials|customers|customer_addresses)$/]",
          message:
            "Orders, expenses, business settings, the catalog and customers go through `@/lib/data/{orders,expenses,business-settings,catalog,customers}`, not direct Supabase calls.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(orders?|expenses|business-settings|cogs|orders-reconciliation|expenses-business-settings|products|variants|packaging-materials|product-bom-items(-all)?|customers|customer_addresses|dashboard-(orders-with-items|recent-orders|expenses|expenses-full|business-settings|products|variants|customers))$/]",
          message:
            "Build these cache keys with `ordersKeys` / `expensesKeys` / `businessSettingsKeys` / `catalogKeys` / `customersKeys` (or the invalidate helpers).",
        },
      ],
    },
  },
  {
    // Admin catalog data layer: the inventory screens, the BOM editor and the
    // packaging tab read and write products, variants, stock, packaging
    // materials and BOM lines through `@/lib/data/catalog`, so every write is
    // brand-scoped and typed, and the lists are refreshed through `catalogKeys`.
    files: [
      "src/features/inventory/**",
      "src/components/inventory/**",
      "src/components/products/**",
      "src/routes/_authenticated/admin.b.$slug.inventory.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(products|product_variants|product_bom_items|packaging_materials|business_settings|orders|order_items)$/]",
          message:
            "The admin catalog, the settings row and orders go through `@/lib/data/{catalog,business-settings,orders}`, not direct Supabase calls.",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value='rpc_adjust_variant_stock']",
          message: "Use `adjustVariantStock` from `@/lib/data/catalog` for manual stock changes.",
        },
        {
          selector:
            "CallExpression[callee.expression.property.name='rpc'][arguments.0.value='rpc_adjust_variant_stock']",
          message: "Use `adjustVariantStock` from `@/lib/data/catalog` for manual stock changes.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(products|variants|packaging-materials|product-bom-items(-all)?|inventory-sales-past45)$/]",
          message: "Build these cache keys with `catalogKeys` (or `invalidateCatalog`).",
        },
      ],
    },
  },
  {
    // Customers data layer: the admin customers list and profile and the
    // address manager read and write customers and saved addresses through
    // `@/lib/data/customers`. The saved-addresses key used to hold a brand's
    // addresses in some screens and one customer's in others.
    files: [
      "src/routes/_authenticated/admin.b.$slug.customers.*",
      "src/components/customer-address-manager.tsx",
      "src/routes/_authenticated/admin.b.$slug.import.tsx",
      "src/routes/_authenticated/admin.b.$slug.campaigns.tsx",
      "src/routes/_authenticated/admin.b.$slug.export.tsx",
      "src/components/communications/CustomerPushCenter.tsx",
      "src/components/loyalty/LoyaltyManualAdjustmentDialog.tsx",
      "src/components/spotlight-command-palette.tsx",
      "src/components/app-shell.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(customers|customer_addresses|business_settings|orders|order_items)$/]",
          message:
            "Customers, the settings row and orders go through `@/lib/data/{customers,business-settings,orders}`, not direct Supabase calls.",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value='delete_brand_customers']",
          message: "Use `deleteCustomers` from `@/lib/data/customers`.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(customers|customer_addresses|customer-profile(-addresses|-orders)?|customer-orders|campaigns-customer-orders|export-orders|breadcrumb-order-number)$/]",
          message: "Build these cache keys with `customersKeys` (or `invalidateCustomers`).",
        },
      ],
    },
  },
  {
    // Settings data layer: the settings form, its cards, the Pages screen and
    // the packaging tab's BOM switch read and write `business_settings` and
    // `brands` through `@/lib/data/{business-settings,brands}`, so one save
    // refreshes every screen showing the same row.
    files: [
      "src/features/settings/**",
      "src/components/settings/**",
      "src/routes/_authenticated/admin.b.$slug.settings*",
      "src/routes/_authenticated/admin.b.$slug.pages.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(business_settings|brands)$/]",
          message:
            "Settings go through `@/lib/data/business-settings` and `@/lib/data/brands` (queries and mutations), not direct Supabase calls.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(business-settings.*|brands?|store-profile|readiness-(business-settings|brand-details))$/]",
          message:
            "Build these cache keys with `businessSettingsKeys` / `brandKeys` (or the invalidate helpers).",
        },
      ],
    },
  },
  {
    // Admin screens that show a slice of the settings row (currency, business
    // name, contact) read the shared row, so a settings save refreshes them.
    files: [
      "src/routes/_authenticated/admin.b.$slug.discounts.tsx",
      "src/routes/_authenticated/admin.b.$slug.returns.*",
      "src/routes/_authenticated/admin.b.$slug.reviews.tsx",
      "src/routes/_authenticated/admin.b.$slug.content-studio.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(business_settings|orders|order_items)$/]",
          message:
            "Read the settings row and orders through `@/lib/data/business-settings` and `@/lib/data/orders`.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(business-settings.*|business-name|content-studio-settings|review-story-(brand|order)|discounts-analytics)$/]",
          message: "Use `businessSettingsQueries.detail` instead of a hand-built settings key.",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
