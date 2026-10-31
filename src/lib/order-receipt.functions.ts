import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  phoneMatches,
  receiptOpen,
  typedOrderNumber,
  type OrderReceipt,
  type ReceiptLine,
} from "@/features/order-receipt/lib/order-receipt";

/**
 * A shopper's own order, read by the server with the service role (a visitor reads no order):
 * the thank-you page's receipt, from the order's id while it is fresh (`receiptOpen`), and the
 * order tracking page, from its number and the phone it was placed with (`phoneMatches`). Both
 * answer null for anything else, so a wrong guess and a missing order look the same.
 */

const ORDER_COLUMNS = `
  id, brand_id, invoice_number, created_at, channel, currency, subtotal, discount, shipping,
  tax_amount, total, advance_paid, payment_method, payment_status, status, fulfillment_status,
  fulfillment_method, public_invoice_token, customer_phone_snapshot,
  customers(phone),
  order_items(description, name_ar, name_en, quantity, line_total, products(name, name_ar, name_en))
`;

type OrderRow = {
  id: string;
  brand_id: string;
  invoice_number: number | null;
  created_at: string | null;
  channel: string | null;
  currency: string | null;
  subtotal: number | null;
  discount: number | null;
  shipping: number | null;
  tax_amount: number | null;
  total: number | null;
  advance_paid: number | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string | null;
  fulfillment_status: string | null;
  fulfillment_method: string | null;
  public_invoice_token: string | null;
  customer_phone_snapshot: string | null;
  customers: { phone: string | null } | null;
  order_items: ReceiptLine[] | null;
};

type StoreRow = {
  brand_id: string;
  currency: string | null;
  order_number_prefix: string | null;
  order_number_digits: number | null;
};

async function storeOf(slug: string): Promise<StoreRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!brand) return null;
  const { data: settings } = await supabaseAdmin
    .from("business_settings")
    .select("currency, order_number_prefix, order_number_digits")
    .eq("brand_id", brand.id)
    .maybeSingle();
  return {
    brand_id: brand.id,
    currency: settings?.currency ?? null,
    order_number_prefix: settings?.order_number_prefix ?? null,
    order_number_digits: settings?.order_number_digits ?? null,
  };
}

const money = (value: number | null | undefined) => Number(value ?? 0) || 0;

function receiptOf(order: OrderRow, store: StoreRow): OrderReceipt {
  return {
    invoiceNumber: order.invoice_number,
    numberFormat: {
      order_number_prefix: store.order_number_prefix,
      order_number_digits: store.order_number_digits,
    },
    createdAt: order.created_at ?? "",
    currency: order.currency || store.currency || "BHD",
    subtotal: money(order.subtotal),
    discount: money(order.discount),
    shipping: money(order.shipping),
    tax: money(order.tax_amount),
    total: money(order.total),
    paid: money(order.advance_paid),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    status: order.status ?? "pending",
    fulfillmentStatus: order.fulfillment_status,
    fulfillmentMethod: order.fulfillment_method,
    invoiceToken: order.public_invoice_token,
    lines: (order.order_items ?? []).map((line) => ({
      description: line.description,
      name_ar: line.name_ar,
      name_en: line.name_en,
      products: line.products ?? null,
      quantity: Number(line.quantity ?? 0),
      line_total: money(line.line_total),
    })),
  };
}

export const getOrderReceipt = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ slug: z.string().min(1).max(64), orderId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<OrderReceipt | null> => {
    const store = await storeOf(data.slug);
    if (!store) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", data.orderId)
      .eq("brand_id", store.brand_id)
      .maybeSingle();
    if (error) {
      console.error("[getOrderReceipt] order query failed", error);
      return null;
    }
    if (!order || !receiptOpen(order as unknown as OrderRow, Date.now())) return null;
    return receiptOf(order as unknown as OrderRow, store);
  });

/* Order tracking: a few tries an hour from one address, so neither a number nor a phone can be
   guessed by trying them all. */
const WINDOW_MS = 60 * 60 * 1000;
const TRIES_PER_IP = 10;
const tries = new Map<string, number[]>();

function allowTry(key: string, now: number): boolean {
  const recent = (tries.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= TRIES_PER_IP) {
    tries.set(key, recent);
    return false;
  }
  recent.push(now);
  tries.set(key, recent);
  if (tries.size > 10_000) tries.clear();
  return true;
}

function clientIp(): string {
  try {
    const request = getRequest();
    return (
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

export type TrackResult =
  { found: true; receipt: OrderReceipt } | { found: false; limited: boolean };

export const trackOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(64),
        number: z.string().min(1).max(32),
        phone: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<TrackResult> => {
    if (!allowTry(`track:${clientIp()}`, Date.now())) return { found: false, limited: true };
    const store = await storeOf(data.slug);
    if (!store) return { found: false, limited: false };
    const number = typedOrderNumber(data.number, store);
    if (number === null) return { found: false, limited: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("brand_id", store.brand_id)
      .eq("invoice_number", number)
      .maybeSingle();
    if (error || !order) return { found: false, limited: false };
    const row = order as unknown as OrderRow;
    const phone = row.customer_phone_snapshot || row.customers?.phone;
    if (!phoneMatches(phone, data.phone)) return { found: false, limited: false };
    return { found: true, receipt: receiptOf(row, store) };
  });
