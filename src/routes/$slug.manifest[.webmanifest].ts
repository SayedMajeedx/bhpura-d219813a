import { createFileRoute } from "@tanstack/react-router";
import { fetchStorefrontPageData } from "@/lib/data/storefront";
import { manifestIcon } from "@/lib/storefront-manifest";

export const Route = createFileRoute("/$slug/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { slug } = params;

        try {
          let brand: any = null;
          let settings: any = null;

          // 1. Try public RPC first (SECURITY DEFINER)
          try {
            const pageData = await fetchStorefrontPageData(slug);
            if (pageData?.brand) {
              brand = pageData.brand;
              settings = pageData.settings;
            }
          } catch {
            /* fallback to admin query */
          }

          // 2. If RPC did not return data, fallback to server supabaseAdmin
          if (!brand) {
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: b } = await supabaseAdmin
                .from("brands")
                .select("id, slug, name_en, name_ar, primary_color, logo_url")
                .eq("slug", slug)
                .maybeSingle();

              if (b) {
                brand = b;
                const { data: s } = await supabaseAdmin
                  .from("business_settings")
                  .select(
                    "business_name, storefront_accent_color, storefront_background_color, logo_url, favicon_url",
                  )
                  .eq("brand_id", b.id)
                  .maybeSingle();
                settings = s;
              }
            } catch {
              /* ignore and use fallback */
            }
          }

          const name = settings?.business_name || brand?.name_ar || brand?.name_en || slug;
          const shortName = brand?.name_ar || brand?.name_en || slug;
          const themeColor = settings?.storefront_accent_color || brand?.primary_color || "#3f121a";
          const bgColor = settings?.storefront_background_color || "#ffffff";

          const manifest = {
            name,
            short_name: shortName,
            start_url: `/${slug}`,
            display: "standalone",
            background_color: bgColor,
            theme_color: themeColor,
            orientation: "portrait-primary",
            icons: [manifestIcon(settings, brand)],
          };

          return new Response(JSON.stringify(manifest), {
            status: 200,
            headers: {
              "Content-Type": "application/manifest+json; charset=utf-8",
              "Cache-Control": "public, max-age=3600, s-maxage=86400",
            },
          });
        } catch (err: any) {
          console.error("Failed to generate webmanifest for", slug, err);
          return new Response(JSON.stringify({ error: "Failed to generate manifest" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
