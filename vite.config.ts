import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Order Detail is an explicitly documented temporary exception. All other
    // route chunks must remain below this ceiling.
    chunkSizeWarningLimit: 600,
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes("node_modules")) {
                if (
                  id.includes("@zxing") ||
                  id.includes("html5-qrcode") ||
                  id.includes("jsbarcode")
                ) {
                  return "vendor-barcode";
                }
                if (id.includes("@supabase")) {
                  return "vendor-supabase";
                }
                if (id.includes("lucide-react")) {
                  return "vendor-icons";
                }
              }
            },
          },
        },
      },
    },
    ssr: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: false,
          },
        },
      },
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    react(),
    tailwindcss(),
    {
      name: "boutq-dev-optimizer-fast",
      enforce: "post",
      config(config) {
        if (config.environments?.ssr?.optimizeDeps) {
          config.environments.ssr.optimizeDeps.noDiscovery = true;
          config.environments.ssr.optimizeDeps.include = [
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-dom",
            "react-dom/server",
            "@supabase/supabase-js",
            "aws4fetch",
            "@tanstack/react-store",
            "@tanstack/react-router",
          ];
        }
      },
      configEnvironment(name, envConfig) {
        if (name === "ssr" && envConfig.optimizeDeps) {
          envConfig.optimizeDeps.noDiscovery = true;
          envConfig.optimizeDeps.include = [
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-dom",
            "react-dom/server",
            "@supabase/supabase-js",
            "aws4fetch",
            "@tanstack/react-store",
            "@tanstack/react-router",
          ];
        }
        if (name === "client" && envConfig.optimizeDeps?.entries) {
          const entries = Array.isArray(envConfig.optimizeDeps.entries)
            ? envConfig.optimizeDeps.entries
            : [envConfig.optimizeDeps.entries];
          envConfig.optimizeDeps.entries = entries.filter(
            (entry: string) => typeof entry === "string" && !entry.includes("router")
          );
        }
      },
    },
  ],
  optimizeDeps: {
    exclude: ["vinxi/http"],
  },
  ssr: {
    optimizeDeps: {
      exclude: ["vinxi/http"],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
