import { createFileRoute } from "@tanstack/react-router";
import { tapCustomer } from "@/lib/payments/gift-card-charge";

/**
 * Starts the card payment of a gift card bought online (step four of docs/gift-cards-plan.md).
 * The request names its purchase and the token only the shopper's own browser was given; the
 * amount and currency are the purchase's own, never the browser's. A purchase already sent to
 * the gateway resumes its charge rather than start a second one.
 */

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/gift-cards/charge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!sameOrigin(request)) {
            return json(403, { code: "PAYMENT_ORIGIN_FORBIDDEN", error: "Request rejected." });
          }
          const body = await request.json<{
            purchaseId?: string;
            brandId?: string;
            token?: string;
          }>();
          const { purchaseId, brandId, token } = body;
          if (!purchaseId || !brandId || !token) {
            return json(400, { code: "PAYMENT_REQUEST_INVALID", error: "Missing details." });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { keepChargeReference, readPurchaseForCharge, tapKey } =
            await import("@/lib/gift-card-purchase.server");
          const purchase = await readPurchaseForCharge(supabaseAdmin, {
            purchaseId,
            brandId,
            token,
          });
          if (!purchase) {
            return json(404, { code: "PURCHASE_NOT_FOUND", error: "Purchase not found." });
          }
          if (purchase.payment_method !== "card") {
            return json(409, { code: "PURCHASE_NOT_BY_CARD", error: "Not a card payment." });
          }
          if (purchase.status === "paid") {
            return json(409, { code: "PURCHASE_ALREADY_PAID", error: "Already paid." });
          }
          if (purchase.status !== "pending") {
            return json(409, { code: "PURCHASE_NOT_PENDING", error: "This purchase is over." });
          }

          const key = await tapKey(supabaseAdmin, brandId);
          if (!key) {
            return json(503, {
              code: "PAYMENT_GATEWAY_UNAVAILABLE",
              error: "Card payment is temporarily unavailable.",
            });
          }

          if (purchase.gateway_reference) {
            const existing = await fetch(
              `https://api.tap.company/v2/charges/${encodeURIComponent(purchase.gateway_reference)}`,
              { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
            );
            if (existing.ok) {
              const charge = await existing.json<{
                metadata?: { gift_card_purchase_id?: string; brand_id?: string };
                transaction?: { url?: string };
              }>();
              if (
                charge.metadata?.gift_card_purchase_id === purchaseId &&
                charge.metadata?.brand_id === brandId &&
                charge.transaction?.url
              ) {
                return json(200, { redirectUrl: charge.transaction.url });
              }
            }
            return json(409, {
              code: "PAYMENT_NOT_RESUMABLE",
              error: "The earlier payment attempt could not be resumed.",
            });
          }

          const origin = new URL(request.url).origin;
          const tapRes = await fetch("https://api.tap.company/v2/charges", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: Number(purchase.amount),
              currency: purchase.currency.toUpperCase(),
              threeDSecure: true,
              save_card: false,
              description: `Gift card ${purchaseId.slice(0, 8)}`,
              statement_descriptor: "BOUTQ",
              metadata: { gift_card_purchase_id: purchaseId, brand_id: brandId },
              reference: {
                transaction: purchaseId,
                order: purchaseId,
                idempotent: `gc_${purchaseId.replace(/-/g, "").slice(0, 40)}`,
              },
              customer: tapCustomer({
                name: purchase.buyer_name,
                phone: purchase.buyer_phone,
                email: purchase.buyer_email,
                id: purchaseId,
              }),
              source: { id: "src_all" },
              redirect: {
                url: `${origin}/api/public/gift-cards/tap-redirect?purchase_id=${encodeURIComponent(purchaseId)}&brand_id=${encodeURIComponent(brandId)}`,
              },
            }),
          });
          if (!tapRes.ok) {
            console.error(
              JSON.stringify({ event: "gift_card_charge_rejected", status: tapRes.status }),
            );
            return json(502, {
              code: "PAYMENT_GATEWAY_REJECTED",
              error: "The payment could not be started. Please try again.",
            });
          }
          const charge = await tapRes.json<{ id?: string; transaction?: { url?: string } }>();
          if (!charge.id || !charge.transaction?.url) {
            return json(502, { code: "PAYMENT_GATEWAY_INCOMPLETE", error: "Incomplete answer." });
          }

          const kept = await keepChargeReference(supabaseAdmin, {
            purchaseId,
            brandId,
            chargeId: charge.id,
          });
          if (!kept) {
            return json(409, {
              code: "PAYMENT_ALREADY_STARTED",
              error: "A different payment attempt is already active.",
            });
          }
          return json(200, { redirectUrl: charge.transaction.url });
        } catch (err) {
          console.error(
            JSON.stringify({
              event: "gift_card_charge_error",
              errorType: err instanceof Error ? err.name : "UnknownError",
            }),
          );
          return json(500, { code: "PAYMENT_INTERNAL_ERROR", error: "Payment could not start." });
        }
      },
    },
  },
});
