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
                if (id.includes("jspdf") || id.includes("html2pdf") || id.includes("html2canvas")) {
                  return "vendor-pdf";
                }
                if (
                  id.includes("@zxing") ||
                  id.includes("html5-qrcode") ||
                  id.includes("jsbarcode")
                ) {
                  return "vendor-barcode";
                }
                if (id.includes("recharts") || id.includes("d3-")) {
                  return "vendor-charts";
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
