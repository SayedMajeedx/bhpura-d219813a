import { publicSupabase } from "@/integrations/supabase/client";

export type ProductEngagementEvent = "view" | "click" | "inquiry";

/**
 * Reliably tracks storefront product engagement (views, clicks, and WhatsApp inquiries).
 * Uses fetch with `keepalive: true` so the browser guarantees delivery even when
 * navigating away or opening an external WhatsApp tab.
 */
export async function trackProductEngagement(
  brandSlug: string,
  productId: string,
  event: ProductEngagementEvent,
): Promise<void> {
  if (typeof window === "undefined" || !brandSlug || !productId) return;

  const baseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://ikciahnuqhemvnyfvbyp.supabase.co";

  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/rpc/record_storefront_product_engagement`;

  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

  const payload = JSON.stringify({
    p_brand_slug: brandSlug,
    p_product_id: productId,
    p_event: event,
  });

  try {
    if (typeof fetch === "function") {
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
        },
        body: payload,
        keepalive: true,
      });
      return;
    }
  } catch {
    // Fall back to publicSupabase RPC if direct fetch encounters an error
    try {
      await (publicSupabase.rpc as any)("record_storefront_product_engagement", {
        p_brand_slug: brandSlug,
        p_product_id: productId,
        p_event: event,
      });
    } catch {
      // Best-effort tracking: avoid throwing to user interface
    }
  }
}
