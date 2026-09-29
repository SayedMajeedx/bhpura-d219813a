/**
 * What a card payment charges for an order: its total, or only the deposit
 * of a booking it pays for (bookings.deposit_amount, set at checkout from the
 * store's deposit percent; the rest is due at the event). The charge route,
 * the redirect and the webhook all decide with these rules, so the amount
 * charged, the amount verified and what the order records always agree.
 */

export type ChargePlan = { kind: "full" | "deposit"; amount: number };

/** Amounts are compared to the fils (3 decimals). */
const TOLERANCE = 0.001;

export function chargePlan(orderTotal: number, depositAmount?: number | null): ChargePlan {
  const total = Number(orderTotal);
  const deposit = Number(depositAmount ?? 0);
  if (deposit > 0 && deposit < total - TOLERANCE) return { kind: "deposit", amount: deposit };
  return { kind: "full", amount: total };
}

/** Whether the gateway charged what the plan asked for. */
export function chargeMatches(charged: unknown, plan: ChargePlan): boolean {
  const amount = Number(charged);
  return Number.isFinite(amount) && Math.abs(amount - plan.amount) <= TOLERANCE;
}

/** Whether the order has already been paid as far as the plan goes (no second charge). */
export function alreadySettled(
  paymentStatus: string | null | undefined,
  plan: ChargePlan,
): boolean {
  const status = String(paymentStatus ?? "").toLowerCase();
  if (["paid", "captured", "success"].includes(status)) return true;
  return plan.kind === "deposit" && ["partially_paid", "partial"].includes(status);
}

/** What the order records once the gateway confirms the charge. */
export function paidOrderUpdate(plan: ChargePlan, gatewayReference: string) {
  return plan.kind === "deposit"
    ? {
        payment_status: "partially_paid",
        advance_paid: plan.amount,
        status: "confirmed",
        payment_gateway_reference: gatewayReference,
      }
    : { payment_status: "paid", status: "confirmed", payment_gateway_reference: gatewayReference };
}

/** A deposit of `percent` of `total`, rounded up to the fils. None at 0% or 100%. */
export function depositOf(total: number, percent: number): number | null {
  if (!(percent > 0 && percent < 100)) return null;
  return Math.ceil(Number(total) * percent * 10 - 1e-9) / 1000;
}
