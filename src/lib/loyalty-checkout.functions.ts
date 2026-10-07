import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Loyalty at checkout, decided by the server. The browser only says which order and how many
 * points; the server checks the order is the signed-in shopper's, takes the customer, the amounts
 * and the idempotency key from the order itself, and calls the database as the service role (the
 * database functions are not callable from a browser: migration 20261007140000).
 */

const OrderInput = z.object({ orderId: z.string().uuid() });
const RedeemInput = OrderInput.extend({ points: z.number().int().positive().max(1_000_000) });

type Context = {
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
  };
};

/** The order must belong to the signed-in shopper (the database says so, from the session). */
async function requireOwnOrder(context: Context, orderId: string) {
  const { data: owns } = await context.supabase.rpc("storefront_user_owns_order", {
    p_order_id: orderId,
  });
  if (owns !== true) throw new Error("FORBIDDEN_ORDER");
}

type Redemption = {
  success?: boolean;
  error?: string;
  already_redeemed?: boolean;
  points_redeemed?: number;
  discount_amount?: number | string;
  new_total?: number | string;
};

/**
 * Takes the points from the shopper's balance and lowers the order's total by their value, in one
 * database transaction. Asked twice, it does it once.
 */
export const redeemLoyaltyForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => RedeemInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireOwnOrder(context as Context, data.orderId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin.rpc as CallableFunction)(
      "redeem_loyalty_points_for_order",
      { p_order_id: data.orderId, p_points: data.points },
    );
    const redemption = (result ?? {}) as Redemption;
    if (error || redemption.success !== true) {
      return {
        applied: false as const,
        error: String(redemption.error ?? error?.message ?? "REDEMPTION_FAILED"),
      };
    }
    return {
      applied: true as const,
      discount: Number(redemption.discount_amount ?? 0),
      total: Number(redemption.new_total ?? 0),
    };
  });

/**
 * Gives the order's points to its customer (held for the programme's holding period). The key is
 * made from the order, so asking again never gives more.
 */
export const awardLoyaltyForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => OrderInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireOwnOrder(context as Context, data.orderId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("brand_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order?.brand_id) return { awarded: false as const };

    const { data: result, error } = await (supabaseAdmin.rpc as CallableFunction)(
      "rpc_award_order_loyalty_points",
      {
        p_brand_id: order.brand_id,
        p_order_id: data.orderId,
        p_idempotency_key: `award:${data.orderId}`,
      },
    );
    return { awarded: !error && (result as { success?: boolean } | null)?.success === true };
  });
