import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ordersKeys } from "./keys";

/**
 * Courier work on an order: assigning (or unassigning) the courier from the
 * order editor, and the delivery message the courier's view shares on
 * WhatsApp.
 */

/** Assigns the order's courier, or clears it with null. Throws the database error. */
export async function assignOrderCourier(orderId: string, courierId: string | null) {
  const { error } = await supabase.rpc("assign_order_courier", {
    p_order_id: orderId,
    // The generated types mark the uuid as required text; NULL unassigns.
    p_courier_id: courierId as string,
  });
  if (error) throw error;
}

export type CourierDeliveryMessage = {
  brand_name?: string;
  message_en?: string;
  message_ar?: string;
};

/** The brand's delivery message for this order, in both languages. */
export async function fetchCourierDeliveryMessage(orderId: string) {
  const { data, error } = await supabase.rpc("get_courier_delivery_message", {
    p_order_id: orderId,
  });
  if (error) throw error;
  return data as CourierDeliveryMessage;
}

export const courierQueries = {
  deliveryMessage: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: [...ordersKeys.all(brandId), "courier-message", orderId] as const,
      queryFn: () => fetchCourierDeliveryMessage(orderId),
      enabled: Boolean(orderId),
      staleTime: 300_000,
    }),
};
