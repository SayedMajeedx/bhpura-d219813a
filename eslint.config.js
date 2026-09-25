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
    // Profiles data layer: route guards read the caller through
    // `profilesQueries.caller` / `fetchCallerProfile`, courier lists through
    // `profilesQueries.couriers`. Listed first: the domain blocks below replace
    // this rule for their files, so each of them forbids `profiles` too.
    files: ["src/routes/**", "src/components/**", "src/features/**"],
    ignores: ["src/routes/api.*", "src/routes/first-login.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='from'][arguments.0.value='profiles']",
          message:
            "Profiles go through `@/lib/data/profiles` (caller profile, couriers, names, updateProfile).",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(auth_profile_role|caller_profile|caller_permissions|reports-(overview(-previous)?|sales|products(-inquiries)?|customers)|brand_by_slug|brand_icon_settings|brands-switcher|super_all_brands_list)$/]",
          message:
            "Use `profilesQueries.caller` / `profilesKeys` for the caller's profile, `reportingQueries` / `reportingKeys` for reports, and `brandQueries` / `brandKeys` for brand lookups.",
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
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(products|product_variants|categories|customization_options|profiles)$/]",
          message:
            "Storefront catalog reads go through `@/lib/data/storefront` (storefrontQueries / fetchers), not direct Supabase calls.",
        },
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(customers|customer_addresses|orders|order_items|return_requests|brand_return_policies|profiles)$/]",
          message:
            "The shopper's own records and orders go through `@/lib/data/customers` (ownCustomerQueries, fetchOwnCustomer, the customer mutations) and `@/lib/data/storefront` (orderConfirmation).",
        },
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(brand_loyalty_programs|brand_loyalty_tiers|loyalty_accounts|loyalty_ledger|profiles)$/]",
          message: "Loyalty reads go through `@/lib/data/loyalty`.",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value='validate_promo_code']",
          message: "Use `validatePromoCode` from `@/lib/data/promo-codes`.",
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
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(orders|order_items|expenses|business_settings|products|product_variants|product_bom_items|packaging_materials|customers|customer_addresses|return_requests|message_templates|profiles)$/]",
          message:
            "Orders, expenses, business settings, the catalog and customers go through `@/lib/data/{orders,expenses,business-settings,catalog,customers}`, not direct Supabase calls.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(orders?|expenses|business-settings|cogs|orders-reconciliation|expenses-business-settings|products|variants|packaging-materials|product-bom-items(-all)?|customers|customer_addresses|message-templates|dashboard-(orders-with-items|recent-orders|expenses|expenses-full|business-settings|products|variants|customers|pending-returns|incubator-sales|catalog-inquiries|reporting-overview(-previous)?))$/]",
          message:
            "Build these cache keys with `ordersKeys` / `expensesKeys` / `businessSettingsKeys` / `catalogKeys` / `customersKeys` (or the invalidate helpers).",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value='rpc_reporting_incubator_sales']",
          message: "Use `reportingQueries.incubatorSales` from `@/lib/data/reporting`.",
        },
        {
          selector:
            "CallExpression[callee.expression.property.name='rpc'][arguments.0.value='rpc_reporting_incubator_sales']",
          message: "Use `reportingQueries.incubatorSales` from `@/lib/data/reporting`.",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value='validate_promo_code']",
          message: "Use `validatePromoCode` from `@/lib/data/promo-codes`.",
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
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(products|product_variants|product_bom_items|packaging_materials|business_settings|orders|order_items|categories|profiles)$/]",
          message:
            "The admin catalog, categories, the settings row and orders go through `@/lib/data/{catalog,categories,business-settings,orders}`, not direct Supabase calls.",
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
            "ArrayExpression > Literal:first-child[value=/^(products|variants|packaging-materials|product-bom-items(-all)?|inventory-sales-past45|categories)$/]",
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
      "src/components/spotlight-command-palette.tsx",
      "src/components/app-shell.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(customers|customer_addresses|business_settings|orders|order_items|categories|message_templates|customer_push_devices|customer_push_events|profiles)$/]",
          message:
            "Customers, categories, the settings row and orders go through `@/lib/data/{customers,categories,business-settings,orders}`, not direct Supabase calls.",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value='delete_brand_customers']",
          message: "Use `deleteCustomers` from `@/lib/data/customers`.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(customers|customer_addresses|customer-profile(-addresses|-orders)?|customer-orders|campaigns-customer-orders|export-orders|breadcrumb-order-number|message-templates|campaign-templates|customer-push-devices|customer-push-events)$/]",
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
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(business_settings|brands|brand_return_policies|profiles)$/]",
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
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(business_settings|orders|order_items|promo_codes|product_variants|return_requests|brand_return_policies|profiles)$/]",
          message:
            "Read the settings row and orders through `@/lib/data/business-settings` and `@/lib/data/orders`.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(business-settings.*|business-name|content-studio-settings|review-story-(brand|order)|discounts-analytics|promo-codes|discounts-product-variants)$/]",
          message: "Use `businessSettingsQueries.detail` instead of a hand-built settings key.",
        },
      ],
    },
  },
  {
    // Categories data layer: one key per shape under ["categories", brandId]
    // (bug backlog #1 was three shapes under one key).
    files: ["src/routes/_authenticated/admin.b.$slug.categories.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(categories|profiles)$/]",
          message: "Categories go through `@/lib/data/categories` (queries and mutations).",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value=/^(delete_category|get_brand_categories_with_counts)$/]",
          message:
            "Use `deleteCategory` / `categoriesQueries.overview` from `@/lib/data/categories`.",
        },
        {
          selector:
            "CallExpression[callee.expression.property.name='rpc'][arguments.0.value=/^(delete_category|get_brand_categories_with_counts)$/]",
          message:
            "Use `deleteCategory` / `categoriesQueries.overview` from `@/lib/data/categories`.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(categories|admin-categories-overview)$/]",
          message: "Build these cache keys with `categoriesKeys` (or `invalidateCategories`).",
        },
      ],
    },
  },
  {
    // Loyalty data layer: program, tiers, accounts and ledger under
    // ["loyalty", brandId]. The manual adjustment dialog also picks customers,
    // so this block forbids the customers tables too (a later block replaces
    // the whole rule for a file).
    files: ["src/routes/_authenticated/admin.b.$slug.loyalty.tsx", "src/components/loyalty/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(brand_loyalty_programs|brand_loyalty_tiers|loyalty_accounts|loyalty_ledger|customers|customer_addresses|profiles)$/]",
          message:
            "Loyalty goes through `@/lib/data/loyalty` and customers through `@/lib/data/customers`.",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value='rpc_manual_adjust_loyalty_points']",
          message: "Use `adjustLoyaltyPoints` from `@/lib/data/loyalty`.",
        },
        {
          selector:
            "CallExpression[callee.expression.property.name='rpc'][arguments.0.value='rpc_manual_adjust_loyalty_points']",
          message: "Use `adjustLoyaltyPoints` from `@/lib/data/loyalty`.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(loyalty|brand_loyalty_.*|customer_loyalty_.*|brand_customers_select|customers)$/]",
          message:
            "Build these cache keys with `loyaltyKeys` / `customersKeys` (or `invalidateLoyalty`).",
        },
      ],
    },
  },
  {
    // Incubators data layer: partners, stock held, sales, payments and the
    // stock moves, under ["incubators", brandId]; the catalog reads come from
    // `@/lib/data/catalog`.
    files: [
      "src/routes/_authenticated/admin.b.$slug.incubators.tsx",
      "src/components/incubators/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(incubators|incubator_inventory|incubator_sales|incubator_payments|products|product_variants|profiles)$/]",
          message:
            "Incubators go through `@/lib/data/incubators` and the catalog through `@/lib/data/catalog`.",
        },
        {
          selector:
            "CallExpression[callee.property.name='rpc'][arguments.0.value=/^(transfer_stock_to_incubator|return_stock_from_incubator|record_incubator_sale|reverse_incubator_sale|record_incubator_payment|update_incubator_inventory_item|sync_incubator_inventory_prices)$/]",
          message: "Use the incubator writes in `@/lib/data/incubators`.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(incubators.*|incubator_.*|brand_products_for_incubator|batch-transfer-variants-with-allocations|inventory_(variants|products))$/]",
          message: "Build these cache keys with `incubatorsKeys` (or `invalidateIncubators`).",
        },
      ],
    },
  },
  {
    // Returns data layer: requests, their items' variants and the return policy
    // go through `@/lib/data/returns` (typed, so a missing column fails the
    // build: bug #22 was two variant columns that never existed).
    files: ["src/components/returns/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(return_requests|brand_return_policies|product_variants|profiles)$/]",
          message:
            "The return policy goes through `@/lib/data/returns` (returnsQueries.policy, saveReturnPolicy).",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(brand-return-policy|readiness-return-policy|storefront-return-policy)$/]",
          message: "Use `returnsKeys.policy` (or `invalidateReturns`).",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
