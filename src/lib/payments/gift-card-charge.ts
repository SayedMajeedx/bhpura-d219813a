/**
 * A gift card bought online, paid by card through Tap (step four of docs/gift-cards-plan.md):
 * what a charge's answer means for its purchase. The charge route, the redirect and the webhook
 * all decide with these rules, so the amount charged, the amount checked and the card issued
 * always agree. A card is issued only for a charge Tap says was captured, for this purchase and
 * this store, of the purchase's own amount in its currency.
 */

export type GiftCardCharge = {
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  metadata?: { gift_card_purchase_id?: string; brand_id?: string } | null;
};

export type ChargeVerdict = "paid" | "failed" | "pending" | "mismatch";

const TERMINAL_FAILURES = new Set([
  "ABANDONED",
  "CANCELLED",
  "DECLINED",
  "FAILED",
  "RESTRICTED",
  "TIMEDOUT",
  "VOID",
]);

export function judgeGiftCardCharge(
  charge: GiftCardCharge,
  purchase: { id: string; brandId: string; amount: number; currency: string },
): ChargeVerdict {
  if (
    charge.metadata?.gift_card_purchase_id !== purchase.id ||
    charge.metadata?.brand_id !== purchase.brandId
  ) {
    return "mismatch";
  }
  const amount = Number(charge.amount);
  if (!Number.isFinite(amount) || Math.abs(amount - purchase.amount) > 0.001) return "mismatch";
  if (String(charge.currency ?? "").toUpperCase() !== purchase.currency.toUpperCase()) {
    return "mismatch";
  }
  const status = String(charge.status ?? "").toUpperCase();
  if (status === "CAPTURED" || status === "SUCCESS") return "paid";
  return TERMINAL_FAILURES.has(status) ? "failed" : "pending";
}

/** The customer Tap asks for, from the buyer's name and phone (Bahrain unless it says otherwise). */
export function tapCustomer(input: {
  name: string;
  phone: string;
  email?: string | null;
  id: string;
}) {
  const parts = input.name.trim().split(/\s+/).filter(Boolean);
  const digits = input.phone.replace(/\D/g, "").replace(/^00/, "");
  const country = ["973", "966", "965", "971", "974", "968"].find(
    (code) => digits.startsWith(code) && digits.length > 8,
  );
  return {
    first_name: parts[0] || "Customer",
    last_name: parts.slice(1).join(" ") || "Customer",
    email: input.email || `${input.id.slice(0, 8)}@customer.boutq.com`,
    phone: {
      country_code: country ?? "973",
      number: (country ? digits.slice(country.length) : digits) || "33333333",
    },
  };
}
