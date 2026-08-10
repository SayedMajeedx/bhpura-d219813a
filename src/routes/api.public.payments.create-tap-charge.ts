import { createFileRoute } from "@tanstack/react-router";

const TAP_IDEMPOTENCY_MAX_LENGTH = 50;

function jsonError(status: number, code: string, error: string): Response {
  return Response.json({ code, error }, { status });
}

function isSameOriginBrowserRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function logPaymentError(
  event: string,
  requestId: string,
  details: Record<string, string | number | boolean | null | undefined> = {},
): void {
  console.error(JSON.stringify({ event, requestId, ...details }));
}

/**
 * Tap reuses a charge only when retries carry the same idempotent reference.
 * Hash the tenant + checkout identity into a compact reference while retaining
 * tenant isolation and retry stability.
 */
export async function buildTapIdempotentReference(
  brandId: string,
  orderId: string,
  checkoutKey?: string | null,
): Promise<string> {
  const source = `${brandId}:${orderId}:${checkoutKey || ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `bq_${hex.slice(0, TAP_IDEMPOTENCY_MAX_LENGTH - 3)}`;
}

export const Route = createFileRoute("/api/public/payments/create-tap-charge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json<{
            orderId?: string;
            brandId?: string;
            confirmationToken?: string;
          }>();
          const { orderId, brandId, confirmationToken } = body;
          const requestId = crypto.randomUUID();

          if (!isSameOriginBrowserRequest(request)) {
            return jsonError(403, "PAYMENT_ORIGIN_FORBIDDEN", "Payment request was rejected.");
          }

          if (!orderId || !brandId || !confirmationToken) {
            return jsonError(
              400,
              "PAYMENT_REQUEST_INVALID",
              "Payment request is missing required information.",
            );
          }

          // Dynamically load supabaseAdmin server-only module
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Bind the public request to the unguessable token returned only when this
          // checkout created the order. A leaked order UUID is not sufficient.
          const { data: orderResult, error: orderError } = await supabaseAdmin
            .from("orders")
            .select(
              `
              id,
              brand_id,
              total,
              subtotal,
              shipping,
              discount,
              status,
              payment_status,
              payment_method,
              payment_gateway_reference,
              idempotency_key,
              customer_id,
              customers (
                name,
                phone,
                email
              )
            ` as any,
            )
            .eq("id", orderId)
            .eq("brand_id", brandId)
            .eq("confirmation_email_token", confirmationToken)
            .maybeSingle();

          const order = orderResult as any;
          if (orderError || !order) {
            logPaymentError("tap_charge_order_authorization_failed", requestId, {
              hasDatabaseError: Boolean(orderError),
            });
            return jsonError(404, "PAYMENT_ORDER_NOT_FOUND", "Payment order was not found.");
          }

          const { data: credentialRows, error: credError } = await (supabaseAdmin.rpc as any)(
            "get_integration_credential_secret",
            { p_brand_id: brandId, p_provider: "tap" },
          );
          const credential = credentialRows?.[0];

          if (credError || !credential || !credential.api_key) {
            logPaymentError("tap_charge_credentials_unavailable", requestId, {
              brandId,
              hasDatabaseError: Boolean(credError),
            });
            return jsonError(
              503,
              "PAYMENT_GATEWAY_UNAVAILABLE",
              "Card payment is temporarily unavailable. Please try again.",
            );
          }

          const paymentMethod = String(order.payment_method || "").toLowerCase();
          const paymentStatus = String(order.payment_status || "").toLowerCase();
          const orderStatus = String(order.status || "").toLowerCase();

          if (!["card", "tap"].includes(paymentMethod)) {
            return new Response(
              JSON.stringify({ error: "Order is not eligible for Tap payment." }),
              {
                status: 409,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          if (["paid", "captured", "success"].includes(paymentStatus)) {
            return new Response(JSON.stringify({ error: "Order is already paid." }), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (["cancelled", "canceled", "refunded", "deleted"].includes(orderStatus)) {
            return new Response(
              JSON.stringify({ error: "Order cannot be paid in its current state." }),
              {
                status: 409,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const customerDetails = order.customers || {};
          const fullName = customerDetails.name || "Customer";
          const nameParts = fullName.trim().split(/\s+/);
          const firstName = nameParts[0] || "Customer";
          const lastName = nameParts.slice(1).join(" ") || "Customer";

          const rawPhone = customerDetails.phone || "";
          const cleanPhone = rawPhone.replace(/\D/g, "");
          let countryCode = "973";
          let number = cleanPhone;

          if (cleanPhone.startsWith("973")) {
            number = cleanPhone.slice(3);
          } else if (cleanPhone.startsWith("00973")) {
            number = cleanPhone.slice(5);
          } else if (cleanPhone.startsWith("+973")) {
            number = cleanPhone.slice(4);
          } else if (cleanPhone.length > 8 && cleanPhone.startsWith("966")) {
            countryCode = "966";
            number = cleanPhone.slice(3);
          } else if (cleanPhone.length > 8 && cleanPhone.startsWith("965")) {
            countryCode = "965";
            number = cleanPhone.slice(3);
          } else if (cleanPhone.length > 8 && cleanPhone.startsWith("971")) {
            countryCode = "971";
            number = cleanPhone.slice(3);
          }

          const requestUrl = new URL(request.url);
          const finalRedirectUrl = `${requestUrl.origin}/api/public/payments/tap-redirect?order_id=${encodeURIComponent(orderId)}&brand_id=${encodeURIComponent(brandId)}`;
          const tapIdempotentReference = await buildTapIdempotentReference(
            brandId,
            orderId,
            order.idempotency_key,
          );

          if (order.payment_gateway_reference) {
            const existingTapRes = await fetch(
              `https://api.tap.company/v2/charges/${encodeURIComponent(order.payment_gateway_reference)}`,
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${credential.api_key}`,
                  "Content-Type": "application/json",
                },
              },
            );

            if (existingTapRes.ok) {
              const existingCharge = await existingTapRes.json<{
                metadata?: { order_id?: string; brand_id?: string };
                transaction?: { url?: string };
              }>();
              if (
                existingCharge.metadata?.order_id === orderId &&
                existingCharge.metadata?.brand_id === brandId &&
                existingCharge.transaction?.url
              ) {
                return new Response(
                  JSON.stringify({ redirectUrl: existingCharge.transaction.url }),
                  {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }
            }

            return new Response(
              JSON.stringify({ error: "Existing payment attempt could not be safely resumed." }),
              { status: 409, headers: { "Content-Type": "application/json" } },
            );
          }

          const tapPayload = {
            amount: Number(order.total),
            currency: "BHD",
            threeDSecure: true,
            save_card: false,
            description: `Order #${orderId.slice(0, 8)} Payment`,
            statement_descriptor: "BOUTQ",
            metadata: {
              order_id: orderId,
              brand_id: brandId,
            },
            reference: {
              transaction: orderId,
              order: orderId,
              idempotent: tapIdempotentReference,
            },
            customer: {
              first_name: firstName,
              last_name: lastName,
              email: customerDetails.email || `${orderId.slice(0, 8)}@customer.boutq.com`,
              phone: {
                country_code: countryCode,
                number: number || "33333333",
              },
            },
            source: {
              id: "src_all",
            },
            redirect: {
              url: finalRedirectUrl,
            },
          };

          const tapRes = await fetch("https://api.tap.company/v2/charges", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${credential.api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(tapPayload),
          });

          if (!tapRes.ok) {
            logPaymentError("tap_charge_gateway_rejected", requestId, {
              brandId,
              orderId,
              gatewayStatus: tapRes.status,
            });
            return jsonError(
              502,
              "PAYMENT_GATEWAY_REJECTED",
              "The payment gateway could not start this payment. Please try again.",
            );
          }

          const chargeData = await tapRes.json<{
            id?: string;
            transaction?: { url?: string };
          }>();
          const checkoutUrl = chargeData.transaction?.url;
          const chargeId = chargeData.id;

          if (!checkoutUrl || !chargeId) {
            return new Response(
              JSON.stringify({ error: "Incomplete checkout response from Tap." }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          // Update order with payment gateway reference
          const { data: storedOrder, error: storeError } = await supabaseAdmin
            .from("orders")
            .update({
              payment_gateway_reference: chargeId,
            } as any)
            .eq("id", orderId)
            .eq("brand_id", brandId)
            .is("payment_gateway_reference" as any, null)
            .select("payment_gateway_reference")
            .maybeSingle();

          if (storeError) {
            logPaymentError("tap_charge_reference_persistence_failed", requestId, {
              brandId,
              orderId,
            });
            return jsonError(
              500,
              "PAYMENT_REFERENCE_SAVE_FAILED",
              "Payment could not be initialized safely. Please contact support.",
            );
          }

          if (!storedOrder) {
            const { data: concurrentOrder } = await supabaseAdmin
              .from("orders")
              .select("payment_gateway_reference")
              .eq("id", orderId)
              .eq("brand_id", brandId)
              .maybeSingle();

            if (concurrentOrder?.payment_gateway_reference !== chargeId) {
              return new Response(
                JSON.stringify({ error: "A different payment attempt is already active." }),
                { status: 409, headers: { "Content-Type": "application/json" } },
              );
            }
          }

          return new Response(JSON.stringify({ redirectUrl: checkoutUrl }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: unknown) {
          console.error(
            JSON.stringify({
              event: "tap_charge_unhandled_error",
              errorType: err instanceof Error ? err.name : "UnknownError",
            }),
          );
          return jsonError(
            500,
            "PAYMENT_INTERNAL_ERROR",
            "Payment could not be started. Please try again.",
          );
        }
      },
    },
  },
});
