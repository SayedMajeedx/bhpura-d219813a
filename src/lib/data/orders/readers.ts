import { supabase } from "@/integrations/supabase/client";

/**
 * Order reads for screens outside the order editor and queue: customer
 * metrics, a customer's history, promo usage, variant sales, the data export,
 * the review story, the breadcrumb, the command palette and the inventory
 * history. Each is scoped by brand; the ones that used to swallow errors still
 * do (documented per function), because their screens show a fallback.
 */

/** Every order's customer, total and statuses (customer CRM stats in customers and campaigns). */
export async function fetchCustomerMetricOrders(brandId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_id, total, created_at, status, payment_status, fulfillment_status")
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}
export type CustomerMetricOrderRow = Awaited<ReturnType<typeof fetchCustomerMetricOrders>>[number];

/** One customer's orders, newest first (customer profile). */
export async function fetchCustomerOrders(brandId: string, customerId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, invoice_number, order_date, status, fulfillment_status, payment_status, fulfillment_method, advance_paid, payment_method, total, currency",
    )
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Orders that used a promo code (discount analytics). */
export async function fetchPromoOrders(brandId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("promo_code_id, total, status")
    .eq("brand_id", brandId)
    .not("promo_code_id", "is", null);
  if (error) throw error;
  return data ?? [];
}

export type OrderPromoRow = Awaited<ReturnType<typeof fetchPromoOrders>>[number];

/** Statuses whose orders count as sold for the inventory sales history. */
export const SOLD_ORDER_STATUSES = ["confirmed", "paid", "shipped", "completed"];

/** Sold orders of the last `days` days with their variant quantities (inventory velocity). */
export async function fetchVariantSales(brandId: string, days: number, now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, order_items(variant_id, quantity)")
    .eq("brand_id", brandId)
    .in("status", SOLD_ORDER_STATUSES)
    .gte("created_at", since.toISOString());
  if (error) throw error;
  return data ?? [];
}

/**
 * Every order with its lines, newest first (data export and backup). A
 * failure is logged and reads as no orders, so the other exports still work.
 */
export async function fetchOrdersForExport(brandId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
          id, invoice_number, total, subtotal, shipping, discount, tax_amount,
          payment_method, payment_status, status, fulfillment_status, delivery_notes, created_at, customer_id,
          order_items (
            id, description, quantity, unit_price, unit_cost, line_total
          )
        `,
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to query orders for export:", error);
    return [];
  }
  return data ?? [];
}

/**
 * A reviewed order's date and product media (review story). A failure is
 * logged and reads as null, so the story still renders without photos.
 */
export async function fetchOrderForStory(brandId: string, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_date, created_at, order_items(id, description, product_id, products(id, image_url, media))",
    )
    .eq("brand_id", brandId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.warn("Could not fetch order items for review story:", error);
    return null;
  }
  return data;
}

/** An order's invoice number for the breadcrumb; a failure reads as none. */
export async function fetchOrderInvoiceNumber(brandId: string, orderId: string) {
  const { data } = await supabase
    .from("orders")
    .select("invoice_number, id")
    .eq("brand_id", brandId)
    .eq("id", orderId)
    .maybeSingle();
  return data;
}

/** Invoice numbers of some orders (inventory history); a failure reads as none. */
export async function fetchInvoiceNumbers(brandId: string, orderIds: string[]) {
  const { data } = await supabase
    .from("orders")
    .select("id, invoice_number")
    .eq("brand_id", brandId)
    .in("id", orderIds);
  return data ?? [];
}

/**
 * Up to six orders matching `query` (command palette): by invoice number or
 * customer name when it is a number, else by customer name or phone. A
 * failure reads as no results.
 */
export async function searchOrders(brandId: string, query: string) {
  const term = `%${query}%`;
  const filter = !isNaN(Number(query))
    ? `invoice_number.eq.${parseInt(query, 10)},customer_name_snapshot.ilike.${term}`
    : `customer_name_snapshot.ilike.${term},customer_phone_snapshot.ilike.${term}`;
  const { data } = await supabase
    .from("orders")
    .select("id, invoice_number, total, currency, created_at, customer_name_snapshot")
    .eq("brand_id", brandId)
    .or(filter)
    .limit(6);
  return data ?? [];
}
