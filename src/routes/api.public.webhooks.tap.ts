import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/tap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json<{
            id?: string;
            status?: string;
            metadata?: { order_id?: string; brand_id?: string };
          }>();
          const { id: chargeId, status, metadata } = payload;

          if (!chargeId || !status || !metadata) {
            return new Response("Malformed webhook body.", { status: 400 });
          }

          const orderId = metadata.order_id;
          const brandId = metadata.brand_id;

          if (!orderId || !brandId) {
            return new Response("Missing order_id or brand_id in charge metadata.", {
              status: 400,
            });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Fetch Tap credentials for this brand to make authorized calls
          const { data: credentialRows, error: credError } = await (supabaseAdmin.rpc as any)(
            "get_integration_credential_secret",
            { p_brand_id: brandId, p_provider: "tap" },
          );
          const credential = credentialRows?.[0];

          if (credError || !credential || !credential.api_key) {
            console.error(
              "[Tap Webhook Auth Error]: Missing/inactive credential for brand",
              brandId,
              credError,
            );
            return new Response(
              "Tap Payments integration is not active or configured for this brand.",
              { status: 400 },
            );
          }

          // 2. BACK-CHANNEL SECURE CHECK: Query Tap Charges API directly to authorize and verify payload
          const tapRes = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${credential.api_key}`,
              "Content-Type": "application/json",
            },
          });

          if (!tapRes.ok) {
            const errText = await tapRes.text();
            console.error("[Tap Webhook Verification Fail]: Status:", tapRes.status, errText);
            return new Response("Failed to authenticate charge reference with gateway API.", {
              status: 400,
            });
          }

          const tapCharge = await tapRes.json<{
            status?: string;
            amount?: number | string;
            currency?: string;
            metadata?: { order_id?: string; brand_id?: string };
          }>();
          const verifiedStatus = tapCharge.status?.toUpperCase();
          const verifiedOrderId = tapCharge.metadata?.order_id;
          const verifiedBrandId = tapCharge.metadata?.brand_id;

          if (verifiedOrderId !== orderId || verifiedBrandId !== brandId) {
            console.error(
              "[Tap Webhook Tampering Blocked]: Metadata mismatch. Payload:",
              { orderId, brandId },
              "Tap:",
              { verifiedOrderId, verifiedBrandId },
            );
            return new Response("Metadata verification failure.", { status: 400 });
          }

          // 3. TARGET ORDER LOOKUP & IDEMPOTENCY CHECK
          const { data: targetOrder, error: targetOrderError } = await supabaseAdmin
            .from("orders")
            .select("id, total, currency, payment_status, payment_gateway_reference")
            .eq("id", orderId)
            .eq("brand_id", brandId)
            .maybeSingle();

          if (targetOrderError || !targetOrder) {
            console.error("[Tap Webhook Target Order Not Found]:", {
              orderId,
              brandId,
              targetOrderError,
            });
            return new Response("Order not found.", { status: 404 });
          }

          if (targetOrder.payment_status === "paid") {
            console.log(
              "[Tap Webhook Idempotency]: Order",
              orderId,
              "already paid. Skipping duplicate update.",
            );
            return new Response("OK", { status: 200 });
          }

          // 4. REPLAY ATTACK CHECK: Ensure chargeId isn't claimed by a different order
          const { data: conflictingOrder, error: replayError } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("payment_gateway_reference" as any, chargeId)
            .neq("id", orderId)
            .maybeSingle();

          if (replayError) {
            console.error("[Tap Webhook Replay Check Error]:", replayError);
          }

          if (conflictingOrder) {
            console.error(
              "[Tap Webhook Replay Attack Blocked]: Charge reference",
              chargeId,
              "was already used for order",
              conflictingOrder.id,
            );
            return new Response("Duplicate payment reference.", { status: 400 });
          }

          // 5. AMOUNT & CURRENCY VALIDATION
          const chargeAmount = Number(tapCharge.amount);
          const orderTotal = Number(targetOrder.total);
          if (isNaN(chargeAmount) || Math.abs(chargeAmount - orderTotal) > 0.001) {
            console.error("[Tap Webhook Amount Mismatch]:", { chargeAmount, orderTotal, orderId });
            return new Response("Amount verification failure.", { status: 400 });
          }
          const expectedCurrency = (targetOrder.currency || "BHD").toUpperCase();
          const chargeCurrency = (tapCharge.currency || "").toUpperCase();
          if (chargeCurrency !== expectedCurrency) {
            console.error("[Tap Webhook Currency Mismatch]:", {
              chargeCurrency,
              expectedCurrency,
              orderId,
            });
            return new Response("Currency verification failure.", { status: 400 });
          }

          // 6. Update order status once authoritatively verified by Tap and passed replay checks
          if (verifiedStatus === "CAPTURED" || verifiedStatus === "SUCCESS") {
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
              return new Response("Payment update failed.", { status: 500 });
            }

            console.log(
              `[Tap Webhook Success]: Securely verified and confirmed payment for Order ${orderId}`,
            );
          } else {
            console.warn(
              `[Tap Webhook Non-success Status]: Charge status ${verifiedStatus} for Order ${orderId}`,
            );

            const terminalFailureStatuses = new Set([
              "ABANDONED",
              "CANCELLED",
              "DECLINED",
              "FAILED",
              "RESTRICTED",
              "TIMEDOUT",
              "VOID",
            ]);
            if (terminalFailureStatuses.has(verifiedStatus || "")) {
              const { error: cancelError } = await supabaseAdmin
                .from("orders")
                .update({
                  payment_status: verifiedStatus === "DECLINED" ? "declined" : "failed",
                } as any)
                .eq("id", orderId)
                .eq("brand_id", brandId);
              if (cancelError) {
                console.error("[Tap Webhook Cancellation Error]:", cancelError);
                return new Response("Payment status update failed.", {
                  status: 500,
                });
              }
            }
          }

          return new Response("OK", { status: 200 });
        } catch (err: any) {
          console.error("[Tap Webhook Crash]:", err);
          return new Response("Webhook processing failed.", { status: 500 });
        }
      },
    },
  },
});
