import { publicSupabase } from "@/integrations/supabase/client";
import { supabaseProjectUrl, supabasePublicKey } from "@/lib/supabase-project";

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

  // The project as the build was given it; no address or key is written here (they once
  // were, and had to be changed by hand when the database moved).
  const base = supabaseProjectUrl();
  const key = supabasePublicKey();
  const args = { p_brand_slug: brandSlug, p_product_id: productId, p_event: event };

  try {
    if (base && key && typeof fetch === "function") {
      await fetch(`${base}/rest/v1/rpc/record_storefront_product_engagement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
        },
        body: JSON.stringify(args),
        keepalive: true,
      });
      return;
    }
  } catch {
    // The direct request failed: try once more through the client below.
  }
  try {
    await (publicSupabase.rpc as any)("record_storefront_product_engagement", args);
  } catch {
    // Best-effort tracking: avoid throwing to user interface
  }
}
