import type { TablesUpdate } from "@/integrations/supabase/types";
import type { PaymentBadge } from "@/lib/payment-status";

/** What the Manage payment dialog submits. */
export type PaymentDetailsInput = {
  payment_status: PaymentBadge;
  payment_method: string;
  advance_paid: number;
  payment_reference?: string;
};

/**
 * The `orders` columns a payment update writes. An empty or "unspecified"
 * method clears it; an empty reference keeps the current one.
 *
 * Typed against the generated `orders` update type, so a column that does not
 * exist fails the type check instead of failing the whole save at runtime
 * (which is how `payment_reference` broke before the column was added).
 */
export function orderPaymentUpdate(
  input: PaymentDetailsInput,
  currentReference: string | null | undefined,
) {
  return {
    payment_status: input.payment_status,
    payment_method:
      !input.payment_method || input.payment_method === "unspecified" ? null : input.payment_method,
    advance_paid: input.advance_paid,
    payment_reference: input.payment_reference || currentReference,
  } satisfies TablesUpdate<"orders">;
}
