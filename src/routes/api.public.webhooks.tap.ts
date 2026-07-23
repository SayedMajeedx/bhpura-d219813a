import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/tap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json();
          const { id: chargeId, status, metadata } = payload;

          if (!chargeId || !status || !metadata) {
            return new Response("Malformed webhook body.", { status: 400 });
          }

          const orderId = metadata.order_id;
          const brandId = metadata.brand_id;

          if (!orderId || !brandId) {
            return new Response("Missing order_id or brand_id in charge metadata.", { status: 400 });
          }

          const chargeStatus = status.toUpperCase();

          if (chargeStatus === "CAPTURED" || chargeStatus === "SUCCESS") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

            // Update order status to paid and confirmed
            const { error: updateError } = await supabaseAdmin
              .from("orders")
              .update({
                payment_status: "paid",
                status: "confirmed",
                payment_gateway_reference: chargeId,
              } as any)
              .eq("id", orderId)
              .eq("brand_id", brandId);

            if (updateError) {
              console.error("[Tap Webhook Update Error]:", updateError);
              return new Response(`Database update error: ${updateError.message}`, { status: 500 });
            }

            console.log(`[Tap Webhook Success]: Confirmed paid for Order ${orderId}`);
          }

          return new Response("OK", { status: 200 });
        } catch (err: any) {
          console.error("[Tap Webhook Crash]:", err);
          return new Response(`Webhook Error: ${err.message}`, { status: 500 });
        }
      },
    },
  },
});
