import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chargePlan, type ChargePlan } from "@/lib/payments/charge-plan";

/**
 * The card charge for an order (server only, with the service-role client):
 * the deposit of the booking it pays for, if that booking has one, otherwise
 * the order's total. An order pays for at most one booking. A failed lookup
 * throws rather than guess an amount.
 */
export async function orderChargePlan(
  admin: SupabaseClient<Database>,
  order: { id: string; total: number | string | null },
  brandId: string,
): Promise<ChargePlan> {
  const { data, error } = await admin
    .from("bookings")
    .select("deposit_amount")
    .eq("order_id", order.id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(`BOOKING_DEPOSIT_LOOKUP_FAILED: ${error.message}`);
  return chargePlan(Number(order.total), data?.deposit_amount ?? null);
}
