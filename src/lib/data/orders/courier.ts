import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSession } from "@/lib/auth/session";
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

/**
 * The assigned courier has the parcel and is on the way. Goes through the server route, which
 * checks the order is theirs and lets a courier change the delivery stage only. Throws the
 * server's own message (Arabic when asked for).
 */
export async function courierConfirmPickup(orderId: string, lang: "ar" | "en" = "en") {
  const session = await getCurrentSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/orders/status", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ id: orderId, fulfillment_status: "SHIPPED" }),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => ({}))) as { error?: string; error_ar?: string };
  throw new Error((lang === "ar" && body.error_ar) || body.error || "Could not update the order");
}
