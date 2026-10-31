import { createFileRoute } from "@tanstack/react-router";

/**
 * Where Tap sends the shopper back after paying for a gift card: the charge is checked with Tap
 * itself and the card issued once (`settleGiftCardCharge`), then the shopper goes to the
 * purchase's own page, which shows the card's code once it is paid.
 */
export const Route = createFileRoute("/api/public/gift-cards/tap-redirect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const chargeId = url.searchParams.get("tap_id");
        const purchaseId = url.searchParams.get("purchase_id");
        const brandId = url.searchParams.get("brand_id");
        if (!chargeId || !purchaseId || !brandId) {
          return new Response("Missing tap_id, purchase_id or brand_id.", { status: 400 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { settleGiftCardCharge, storeSlug } =
            await import("@/lib/gift-card-purchase.server");
          const slug = await storeSlug(supabaseAdmin, brandId);
          if (!slug) return new Response("Store not found.", { status: 404 });

          const { verdict, purchase } = await settleGiftCardCharge(supabaseAdmin, {
            purchaseId,
            brandId,
            chargeId,
          });
          if (verdict === "mismatch" || !purchase) {
            return new Response("Payment verification failure.", { status: 400 });
          }
          const search = new URLSearchParams({ t: purchase.token });
          if (verdict === "failed") search.set("payment", "failed");
          return new Response(null, {
            status: 302,
            headers: { Location: `/${slug}/gift-card/${purchaseId}?${search.toString()}` },
          });
        } catch (err) {
          console.error("[Gift card redirect]", err instanceof Error ? err.message : err);
          return new Response("Payment could not be checked. Please contact the store.", {
            status: 500,
          });
        }
      },
    },
  },
});
