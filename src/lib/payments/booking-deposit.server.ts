import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chargePlan, withGiftCards, type ChargePlan } from "@/lib/payments/charge-plan";

/**
 * The card charge for an order (server only, with the service-role client).
 *
 * A store with an advance-payment rule charges what the order owes in advance, as the
 * database works it out from the order's own lines (order_advance_due: the scope, the
 * percentage kept on the order when it was placed, the matching lines only). The same
 * function records a BenefitPay approval and refuses cash on delivery, so the card, the
 * transfer and the refusal always agree. Without an advance, a booking's own deposit
 * applies if its booking has one, otherwise the whole total. An order pays for at most
 * one booking. What gift cards paid on the order (`gift_card_paid`) is taken off the charge
 * (`withGiftCards`), so a caller passes it with the order. A failed lookup throws rather than
 * guess an amount.
 */
export async function orderChargePlan(
  admin: SupabaseClient<Database>,
  order: { id: string; total: number | string | null; gift_card_paid?: number | string | null },
  brandId: string,
): Promise<ChargePlan> {
  return withGiftCards(await upfrontPlan(admin, order, brandId), order.gift_card_paid);
}

async function upfrontPlan(
  admin: SupabaseClient<Database>,
  order: { id: string; total: number | string | null },
  brandId: string,
): Promise<ChargePlan> {
  const { data: advance, error: advanceError } = await admin.rpc("order_advance_due", {
    p_order_id: order.id,
  });
  if (advanceError) throw new Error(`ADVANCE_LOOKUP_FAILED: ${advanceError.message}`);
  const owed = Number(advance);
  if (Number.isFinite(owed) && owed > 0) return chargePlan(Number(order.total), owed);

  const { data, error } = await admin
    .from("bookings")
    .select("deposit_amount")
    .eq("order_id", order.id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(`BOOKING_DEPOSIT_LOOKUP_FAILED: ${error.message}`);
  return chargePlan(Number(order.total), data?.deposit_amount ?? null);
}
