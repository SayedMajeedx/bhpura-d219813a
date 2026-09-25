import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { customersKeys } from "./keys";

/**
 * The signed-in shopper's own customer record and saved addresses, as the
 * storefront account page, the storefront context and the checkout prefill
 * read them (RLS lets a shopper see only the rows linked to their login).
 * Before this, each of the three read the record with its own column list.
 */

/** The shopper's customer record in this brand, or null when none is linked yet. */
export async function fetchOwnCustomer(brandId: string, authUserId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, brand_id, user_id, name, phone, email, created_at, region, block, road, house, flat",
    )
    .eq("brand_id", brandId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export type OwnCustomer = NonNullable<Awaited<ReturnType<typeof fetchOwnCustomer>>>;

/** The shopper's saved addresses: the default first, then newest first. */
export async function fetchOwnAddresses(brandId: string, customerId: string) {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select(
      "id, brand_id, customer_id, label, region, block, road, house, flat, floor, landmark, formatted_address, latitude, longitude, place_id, delivery_notes, is_default",
    )
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export type OwnAddress = Awaited<ReturnType<typeof fetchOwnAddresses>>[number];

/** The shopper's latest 100 orders with their lines, newest first. */
export async function fetchOwnOrders(brandId: string, customerId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, invoice_number, order_date, status, payment_status, fulfillment_status, total, currency, public_invoice_token, order_items(id, description, quantity, unit_price)",
    )
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}
export type OwnOrder = Awaited<ReturnType<typeof fetchOwnOrders>>[number];

export const ownCustomerQueries = {
  orders: (brandId: string, customerId: string | undefined) =>
    queryOptions({
      queryKey: customersKeys.ownOrders(brandId, customerId ?? ""),
      queryFn: () => fetchOwnOrders(brandId, customerId ?? ""),
      enabled: Boolean(brandId && customerId),
    }),
  profile: (brandId: string, authUserId: string | undefined) =>
    queryOptions({
      queryKey: customersKeys.ownProfile(brandId, authUserId ?? ""),
      queryFn: () => fetchOwnCustomer(brandId, authUserId ?? ""),
      enabled: Boolean(brandId && authUserId),
    }),
  addresses: (brandId: string, customerId: string | undefined) =>
    queryOptions({
      queryKey: customersKeys.ownAddresses(brandId, customerId ?? ""),
      queryFn: () => fetchOwnAddresses(brandId, customerId ?? ""),
      enabled: Boolean(brandId && customerId),
    }),
};
