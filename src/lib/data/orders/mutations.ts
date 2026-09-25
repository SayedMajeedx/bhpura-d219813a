import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { ordersKeys } from "./keys";

/**
 * Admin order writes. Every write is scoped by `brand_id` on top of RLS and
 * typed against the generated schema, so a column that does not exist fails
 * the type check instead of the request. After a write, call
 * `invalidateOrders`: it refreshes the queue and any open order of the brand.
 */

export type OrderPatch = TablesUpdate<"orders">;
export type NewOrder = TablesInsert<"orders">;
export type NewOrderItem = TablesInsert<"order_items">;

/** The queue and every open order of the brand are stale after a write. */
export function invalidateOrders(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) });
}

/** Changes columns of one order of the brand. */
export async function updateOrder(brandId: string, orderId: string, patch: OrderPatch) {
  const { error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/**
 * Creates an order with its lines. If the lines fail, the order is deleted
 * again so no empty order is left behind. Returns the new order's id.
 */
export async function createOrderWithItems(
  brandId: string,
  order: NewOrder,
  items: (orderId: string) => NewOrderItem[],
): Promise<string> {
  const { data: created, error } = await supabase
    .from("orders")
    .insert({ ...order, brand_id: brandId })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error("ORDER_CREATE_FAILED");

  const rows = items(created.id);
  if (rows.length > 0) {
    const { error: itemError } = await supabase.from("order_items").insert(rows);
    if (itemError) {
      await supabase.from("orders").delete().eq("id", created.id).eq("brand_id", brandId);
      throw itemError;
    }
  }
  return created.id;
}

/**
 * Replaces an order's lines in one transaction on the server (stock is
 * released and reserved again). Fails with INSUFFICIENT_STOCK when a line
 * cannot be reserved.
 */
export async function replaceOrderItems(orderId: string, items: NewOrderItem[]) {
  const { error } = await supabase.rpc("replace_order_items", {
    p_order_id: orderId,
    p_items: items as unknown as Json,
  });
  if (error) throw error;
}

/** Marks a BenefitPay transfer as verified and the order as paid. */
export async function approveBenefitPayment(orderId: string) {
  const { error } = await supabase.rpc("approve_benefit_payment", { p_order_id: orderId });
  if (error) throw error;
}

/**
 * The courier completes a delivery and records the cash collected, in one
 * server transaction. Returns the error instead of throwing: callers fall
 * back to a direct update when the function is unavailable.
 */
export async function courierCompleteDelivery(
  orderId: string,
  collectedAmount: number,
  notes: string | null,
) {
  const { error } = await supabase.rpc("courier_complete_delivery", {
    p_order_id: orderId,
    p_collected_amount: collectedAmount,
    p_notes: notes ?? undefined,
  });
  return error;
}

/**
 * The courier moves a delivery forward (out for delivery, delivered, failed,
 * returned); the server checks the assignment and the cash due. Returns the
 * error instead of throwing, like `courierCompleteDelivery`.
 */
export async function courierUpdateDelivery(args: {
  orderId: string;
  status: string;
  notes: string | null;
  codCollected: boolean;
  codAmount: number | null;
}) {
  const { error } = await supabase.rpc("courier_update_delivery", {
    p_order_id: args.orderId,
    p_status: args.status,
    p_notes: args.notes ?? undefined,
    p_cod_collected: args.codCollected,
    p_cod_amount: args.codAmount ?? undefined,
  });
  return error;
}
