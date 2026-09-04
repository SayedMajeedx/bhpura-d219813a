import { createFileRoute } from "@tanstack/react-router";
import { orderRequiresCourier } from "@/lib/order-fulfillment";

export const Route = createFileRoute("/api/orders/status")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          const accessToken = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";

          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const body = await request.json<{
            id?: string;
            payment_status?: string;
            fulfillment_status?: string;
            status?: string;
            assigned_to?: string | null;
            delivery_notes?: string | null;
            admin_override?: boolean;
          }>();
          const {
            id,
            payment_status,
            fulfillment_status,
            status,
            assigned_to,
            delivery_notes,
            admin_override,
          } = body;

          if (!id) {
            return new Response(JSON.stringify({ error: "Missing order id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const {
            data: { user },
            error: authError,
          } = await supabaseAdmin.auth.getUser(accessToken);

          if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: profile, error: profileError } = await (
            supabaseAdmin.from("profiles") as any
          )
            .select("role, status, brand_id, permissions")
            .eq("id", user.id)
            .maybeSingle();

          if (profileError || !profile || profile.status !== "active") {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const role = String(profile.role || "");
          const permissions = Array.isArray(profile.permissions) ? profile.permissions : [];
          const isSuperAdmin = role === "super_admin";
          const isAdmin = ["admin", "brand_admin"].includes(role);

          // 1. Fetch current order status details (scoped to user's brand unless super_admin)
          let query = (supabaseAdmin.from("orders") as any)
            .select(
              "id, brand_id, status, payment_status, payment_method, fulfillment_method, fulfillment_status, delivery_notes, assigned_to",
            )
            .eq("id", id);

          if (!isSuperAdmin && profile.brand_id) {
            query = query.eq("brand_id", profile.brand_id);
          }

          const { data: order, error: fetchErr } = await query.maybeSingle();

          if (fetchErr || !order) {
            return new Response(JSON.stringify({ error: "Order not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const isAssignedCourier = role === "courier" && order.assigned_to === user.id;
          const canManageOrders =
            isSuperAdmin || isAdmin || permissions.includes("manage_orders") || isAssignedCourier;

          if (!canManageOrders) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (
            isAssignedCourier &&
            (payment_status !== undefined ||
              status !== undefined ||
              assigned_to !== undefined ||
              admin_override !== undefined)
          ) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (admin_override && !isSuperAdmin && !isAdmin) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (assigned_to !== undefined && !orderRequiresCourier(order)) {
            return new Response(
              JSON.stringify({
                error: "Couriers can only be assigned to delivery orders.",
                error_ar: "يمكن تعيين المندوب لطلبات التوصيل فقط.",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // Determine current vs updated payment and fulfillment statuses
          const currentPayment =
            payment_status !== undefined ? payment_status : order.payment_status;
          const currentFulfillment =
            fulfillment_status !== undefined ? fulfillment_status : order.fulfillment_status;

          const isUnpaid =
            !currentPayment ||
            ["unpaid", "UNPAID", "partially_paid", "PARTIALLY_PAID", "partial"].includes(
              currentPayment,
            );

          const isCod = ["cod", "cash", "cash_on_delivery", "cash on delivery"].includes(
            String(order.payment_method || "").toLowerCase(),
          );

          // Validation Rule: Ensure prepaid online orders cannot move to packing/shipping if unpaid, unless isCod or admin_override is true
          if (
            fulfillment_status &&
            [
              "NEEDS_PACKING",
              "needs_packing",
              "ASSIGNED",
              "assigned",
              "SHIPPED",
              "shipped",
            ].includes(fulfillment_status)
          ) {
            if (isUnpaid && !isCod && !admin_override) {
              const paymentLabel = ["partially_paid", "PARTIALLY_PAID", "partial"].includes(
                currentPayment || "",
              )
                ? "partially paid"
                : "unpaid";
              return new Response(
                JSON.stringify({
                  error: `Order cannot be packaged or shipped because it is ${paymentLabel}.`,
                  error_ar: `لا يمكن تعبئة أو شحن الطلب لأنه ${paymentLabel === "partially paid" ? "مدفوع جزئياً" : "غير مدفوع"}.`,
                }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
          }

          // Prepare updates payload
          const updates: Record<string, any> = {};
          if (payment_status !== undefined) {
            updates.payment_status = payment_status;
          }
          if (fulfillment_status !== undefined) {
            updates.fulfillment_status = fulfillment_status;
            const normalizedFulfillment = fulfillment_status.toLowerCase();
            if (
              status === undefined &&
              ["sent_to_tailor", "received_from_tailor", "packing"].includes(normalizedFulfillment)
            ) {
              updates.status = normalizedFulfillment;
            }
          }
          if (status !== undefined) {
            updates.status = status;
          } else if (
            payment_status?.toLowerCase() === "paid" &&
            String(order.status ?? "").toLowerCase() === "pending_verification"
          ) {
            updates.status = "confirmed";
          }
          if (assigned_to !== undefined) {
            updates.assigned_to = assigned_to;
          }
          if (delivery_notes !== undefined) {
            updates.delivery_notes = delivery_notes;
          }

          // Execute database update
          const { data: updatedOrder, error: updateErr } = await supabaseAdmin
            .from("orders")
            .update(updates as any)
            .eq("id", id)
            .eq("brand_id", order.brand_id)
            .select()
            .single();

          if (updateErr) {
            return new Response(JSON.stringify({ error: updateErr.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: "Order status updated successfully",
              order: updatedOrder,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "An unexpected error occurred" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
