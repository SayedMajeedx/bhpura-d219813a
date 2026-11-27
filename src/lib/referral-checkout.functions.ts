import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Records a referral on the order the shopper has just placed (migration 20261228100000). The
 * order is proven to be the caller's by its confirmation token, as the gift card's step is; the
 * database (`record_order_referral`, server-only) then refuses a member's own code and a customer
 * who ordered before, and answers what it did.
 */
export const recordReferralAtCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        brandId: z.string().uuid(),
        confirmationToken: z.string().min(8).max(200),
        code: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9]{6,12}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ result: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", data.orderId)
      .eq("brand_id", data.brandId)
      .eq("confirmation_email_token", data.confirmationToken)
      .maybeSingle();
    if (orderError || !order) return { result: "ORDER_NOT_FOUND" };

    const { data: reply, error } = await (
      supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )("record_order_referral", { p_order_id: data.orderId, p_code: data.code.toUpperCase() });
    if (error) {
      console.error("[recordReferralAtCheckout] failed", error.message);
      return { result: "FAILED" };
    }
    return { result: String(reply ?? "") };
  });
