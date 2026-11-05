import { createFileRoute } from "@tanstack/react-router";
import { fetchStorefrontPageData } from "@/lib/data/storefront";
import { imageFacts, type ImageFacts } from "@/lib/image-size";
import { iconCandidates, manifestIcon, storefrontManifest } from "@/lib/storefront-manifest";

type Row = Record<string, string | null | undefined>;

/** A picture's real size and kind, from its first bytes; null when it cannot be read in time. */
async function measure(src: string): Promise<ImageFacts | null> {
  if (/\.svg(\?.*)?$/i.test(src)) return null;
  try {
    const response = await fetch(src, {
      headers: { Range: "bytes=0-65535" },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return imageFacts(bytes.subarray(0, 65536));
  } catch {
    return null;
  }
}

/** The store's name, colours and pictures: the public page data, else the server's own read. */
async function readStore(slug: string): Promise<{ brand: Row; settings: Row | null } | null> {
  try {
    const pageData = await fetchStorefrontPageData(slug);
    if (pageData?.brand) {
      return {
        brand: pageData.brand as unknown as Row,
        settings: (pageData.settings ?? null) as unknown as Row | null,
      };
    }
  } catch {
    // The server's own read below.
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, slug, name_en, name_ar, primary_color, logo_url")
      .eq("slug", slug)
      .maybeSingle();
    if (!brand) return null;
    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("business_name, storefront_background_color, header_bg, logo_url, favicon_url")
      .eq("brand_id", brand.id)
      .maybeSingle();
    return {
      brand: brand as unknown as Row,
      settings: (settings ?? null) as unknown as Row | null,
    };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/$slug/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { slug } = params;
        const lang = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "ar";
        const store = await readStore(slug);
        if (!store) {
          return new Response(JSON.stringify({ error: "Store not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        // The icon's size and kind as they really are: the first square one big enough wins, so
        // the rest are not fetched.
        const measured: Array<{ src: string; facts: ImageFacts | null }> = [];
        for (const src of iconCandidates(store.settings, store.brand)) {
          const facts = await measure(src);
          measured.push({ src, facts });
          if (
            /\.svg(\?.*)?$/i.test(src) ||
            (facts && facts.width === facts.height && facts.width >= 144)
          ) {
            break;
          }
        }
        const manifest = storefrontManifest({
          brand: { ...store.brand, slug: store.brand.slug || slug },
          settings: store.settings,
          icon: manifestIcon(measured),
          lang,
        });
        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
          },
        });
      },
    },
  },
});
