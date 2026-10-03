import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chargePlan, depositOf, type ChargePlan } from "@/lib/payments/charge-plan";

/**
 * The card charge for an order (server only, with the service-role client).
 *
 * A store with an advance-payment rule charges that share of the order's total:
 * the percentage kept on the order when it was placed (orders.advance_percent),
 * so a later change to the store's setting does not move it. Without one, a
 * booking's own deposit applies if its booking has one, otherwise the whole
 * total. An order pays for at most one booking. A failed lookup throws rather
 * than guess an amount.
 */
export async function orderChargePlan(
  admin: SupabaseClient<Database>,
  order: { id: string; total: number | string | null },
  brandId: string,
): Promise<ChargePlan> {
  const { data: placed, error: orderError } = await admin
    .from("orders")
    .select("advance_percent")
    .eq("id", order.id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (orderError) throw new Error(`ADVANCE_LOOKUP_FAILED: ${orderError.message}`);
  const percent = Number(placed?.advance_percent ?? 0);
  if (percent > 0) return chargePlan(Number(order.total), depositOf(Number(order.total), percent));

  const { data, error } = await admin
    .from("bookings")
    .select("deposit_amount")
    .eq("order_id", order.id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(`BOOKING_DEPOSIT_LOOKUP_FAILED: ${error.message}`);
  return chargePlan(Number(order.total), data?.deposit_amount ?? null);
}
