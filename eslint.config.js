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
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  eslintPluginPrettier,
);
