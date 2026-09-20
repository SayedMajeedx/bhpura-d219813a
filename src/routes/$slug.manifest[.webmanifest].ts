import { createFileRoute } from "@tanstack/react-router";
import { publicSupabase as supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/$slug/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { slug } = params;

        try {
          const { data: brand } = await supabase
            .from("brands")
            .select("id, slug, name_en, name_ar, primary_color, logo_url")
            .eq("slug", slug)
            .maybeSingle();

          const { data: settings } = brand
            ? await supabase
                .from("business_settings")
                .select(
                  "business_name, storefront_accent_color, storefront_background_color, logo_url, favicon_url",
                )
                .eq("brand_id", brand.id)
                .maybeSingle()
            : { data: null };

          const name = settings?.business_name || brand?.name_ar || brand?.name_en || slug;
          const shortName = brand?.name_ar || brand?.name_en || slug;
          const themeColor = settings?.storefront_accent_color || brand?.primary_color || "#3f121a";
          const bgColor = settings?.storefront_background_color || "#ffffff";
          const iconUrl =
            settings?.logo_url || brand?.logo_url || "https://boutq.store/placeholder.svg";

          const manifest = {
            name,
            short_name: shortName,
            start_url: `/${slug}`,
            display: "standalone",
            background_color: bgColor,
            theme_color: themeColor,
            orientation: "portrait-primary",
            icons: [
              {
                src: iconUrl,
                sizes: "192x192 512x512",
                type: "image/png",
                purpose: "any maskable",
              },
            ],
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
