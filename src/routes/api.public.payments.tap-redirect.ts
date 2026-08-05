import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/tap-redirect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const tapId = url.searchParams.get("tap_id");
        const orderId = url.searchParams.get("order_id");
        const brandId = url.searchParams.get("brand_id");

        if (!tapId || !orderId || !brandId) {
          return new Response("Missing tap_id, order_id, or brand_id parameters.", { status: 400 });
        }

        try {
          // Dynamically load supabaseAdmin
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Get brand slug
          const { data: brand, error: brandError } = await supabaseAdmin
            .from("brands")
            .select("slug")
            .eq("id", brandId)
            .maybeSingle();

          if (brandError || !brand) {
            throw new Error(`Brand not found: ${brandError?.message || ""}`);
          }

          const brandSlug = brand.slug;

          // 2. Fetch Tap credentials to verify the payment status
          const { data: credentialRows, error: credError } = await (supabaseAdmin.rpc as any)(
            "get_integration_credential_secret",
            { p_brand_id: brandId, p_provider: "tap" },
          );
          const credential = credentialRows?.[0];

          if (credError || !credential || !credential.api_key) {
            throw new Error("Tap Payments integration is not active or configured.");
          }

          // 3. Query Tap Charges API for the status
          const tapRes = await fetch(`https://api.tap.company/v2/charges/${tapId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${credential.api_key}`,
              "Content-Type": "application/json",
            },
          });

          if (!tapRes.ok) {
            throw new Error(`Failed to fetch charge status from Tap: ${await tapRes.text()}`);
          }

          const chargeData = await tapRes.json<{
            status?: string;
            metadata?: { order_id?: string; brand_id?: string };
          }>();
          const chargeStatus = chargeData.status?.toUpperCase();

          if (
            chargeData.metadata?.order_id !== orderId ||
            chargeData.metadata?.brand_id !== brandId
          ) {
            return new Response("Payment metadata verification failure.", { status: 400 });
          }

          const { data: order, error: orderError } = await supabaseAdmin
            .from("orders")
            .select("id, payment_gateway_reference, fulfillment_method, digital_delivery_channel")
            .eq("id", orderId)
            .eq("brand_id", brandId)
            .maybeSingle();

          if (orderError || !order || order.payment_gateway_reference !== tapId) {
            return new Response("Payment reference verification failure.", { status: 400 });
          }

          // 4. Handle success vs failure
          if (chargeStatus === "CAPTURED" || chargeStatus === "SUCCESS") {
            // Update order status to paid and confirmed
            const { error: updateError } = await supabaseAdmin
              .from("orders")
              .update({
                payment_status: "paid",
                status: "confirmed",
                payment_gateway_reference: tapId,
              } as any)
              .eq("id", orderId)
              .eq("brand_id", brandId);

            if (updateError) {
              console.error("[Tap Redirect Update Error]:", updateError);
              return new Response("Payment was verified but the order update failed.", {
                status: 500,
              });
            }

            const { error: stockError } = await supabaseAdmin.rpc("sync_order_stock", {
              p_order_id: orderId,
            });
            if (stockError) {
              console.error("[Tap Redirect Stock Sync Error]:", stockError);
              return new Response("Payment was verified but stock reconciliation failed.", {
                status: 500,
              });
            }

            const confirmationSearch = new URLSearchParams({
              payment: "success",
              fulfillment: order.fulfillment_method || "delivery",
              channel: order.digital_delivery_channel || "email",
            });

            // Build confirmation messaging from the persisted order rather than
            // stale or missing client-side checkout state.
            return new Response(null, {
              status: 302,
              headers: {
                Location: `/${brandSlug}/thank-you/${orderId}?${confirmationSearch.toString()}`,
              },
            });
          } else {
            const terminalFailureStatuses = new Set([
              "ABANDONED",
              "CANCELLED",
              "DECLINED",
              "FAILED",
              "RESTRICTED",
              "TIMEDOUT",
              "VOID",
            ]);
            const paymentError = terminalFailureStatuses.has(chargeStatus || "")
              ? "failed"
              : "pending";
            console.warn(
              `[Tap Payment Non-success]: Order ${orderId}, Status: ${chargeStatus || "UNKNOWN"}`,
            );

            if (terminalFailureStatuses.has(chargeStatus || "")) {
              const { error: cancelError } = await supabaseAdmin
                .from("orders")
                .update({
                  payment_status: chargeStatus === "DECLINED" ? "declined" : "failed",
                } as any)
                .eq("id", orderId)
                .eq("brand_id", brandId);
              if (cancelError) {
                console.error("[Tap Redirect Cancellation Error]:", cancelError);
                return new Response("Payment failed but order cancellation failed.", {
                  status: 500,
                });
              }

              const { error: stockError } = await supabaseAdmin.rpc("sync_order_stock", {
                p_order_id: orderId,
              });
              if (stockError) {
                console.error("[Tap Redirect Stock Release Error]:", stockError);
                return new Response("Payment failed but stock release failed.", { status: 500 });
              }
            }

            // Retain the order for reconciliation. A redirect must never destroy an
            // order, especially while the gateway status may still be transient.
            return new Response(null, {
              status: 302,
              headers: {
                Location: `/${brandSlug}/checkout?payment_error=${paymentError}&order_id=${orderId}`,
              },
            });
          }
        } catch (err: any) {
          console.error("[Tap Redirect Endpoint Crash]:", err);
          return new Response(`Payment Redirect Error: ${err.message}`, { status: 500 });
        }
      },
    },
  },
});
