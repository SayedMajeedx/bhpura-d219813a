// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig as originalDefineConfig } from "@lovable.dev/vite-tanstack-config";

const baseConfig = originalDefineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      tsconfigPaths: true,
    },
  },
  nitro: {
    name: "bhpura-d219813a",
    cloudflare: {
      name: "bhpura-d219813a",
    },
  },
});

export default async (env: any) => {
  const config = await baseConfig(env);
  if (config.plugins) {
    config.plugins = config.plugins.filter((plugin: any) => {
      if (!plugin) return true;
      const name = typeof plugin === "object" && plugin !== null ? plugin.name : "";
      return name !== "vite-tsconfig-paths" && name !== "tsconfig-paths";
    });
  }
  return config;
};
