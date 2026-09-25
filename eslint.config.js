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
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(orders|order_items|expenses|business_settings)$/]",
          message:
            "Orders, expenses and business settings go through `@/lib/data/{orders,expenses,business-settings}`, not direct Supabase calls.",
        },
        {
          selector:
            "ArrayExpression > Literal:first-child[value=/^(orders?|expenses|business-settings|cogs|orders-reconciliation|expenses-business-settings|dashboard-(orders-with-items|recent-orders|expenses|expenses-full|business-settings))$/]",
          message:
            "Build these cache keys with `ordersKeys` / `expensesKeys` / `businessSettingsKeys` (or the invalidate helpers).",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
