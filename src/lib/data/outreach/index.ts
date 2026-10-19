import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { customersKeys } from "@/lib/data/customers";
import { readAll } from "../read-all";

/**
 * What "Clients to message today" reads beyond the lists other screens already hold (customers,
 * the catalog, the waiting list, carts): each client's orders of the last year with the size of
 * every piece, and the store's record of who was messaged and why. That record is the activity
 * log (`customer_outreach`): a message sent, a reason put away ("not now"), and a client's answer
 * about hearing from the store (`customer_consent`).
 */

export const OUTREACH_ACTION = "customer_outreach";
export const CONSENT_ACTION = "customer_consent";

/** How far back the page reads orders and its own record. */
const ORDER_DAYS = 400;
const LOG_DAYS = 100;

export const outreachKeys = {
  all: (brandId: string) => ["outreach", brandId] as const,
  orders: (brandId: string) => [...outreachKeys.all(brandId), "orders"] as const,
  log: (brandId: string) => [...outreachKeys.all(brandId), "log"] as const,
  consent: (brandId: string, customerId: string) =>
    [...outreachKeys.all(brandId), "consent", customerId] as const,
};

const since = (days: number, now = Date.now()) => new Date(now - days * 86_400_000).toISOString();

/** The store's orders with a client, of the last 400 days, with each piece's size. */
export async function fetchOutreachOrders(brandId: string) {
  const rows = await readAll((from, to) =>
    supabase
      .from("orders")
      .select(
        "id, customer_id, created_at, status, delivered_at, completed_at, order_items(product_id, variant_id, product_variants(size))",
        { count: "exact" },
      )
      .eq("brand_id", brandId)
      .not("customer_id", "is", null)
      .gte("created_at", since(ORDER_DAYS))
      .order("id")
      .range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    created_at: row.created_at,
    status: row.status,
    delivered_at: row.delivered_at,
    completed_at: row.completed_at,
    items: (row.order_items ?? []).map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      size: item.product_variants?.size ?? null,
    })),
  }));
}

export type OutreachLogRow = {
  contact: string;
  reason: string;
  kind: "sent" | "skipped";
  at: string;
};

/** Who was messaged, or put away, in the last 100 days. */
export async function fetchOutreachLog(brandId: string): Promise<OutreachLogRow[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("activity_logs")
      .select("id, created_at, metadata", { count: "exact" })
      .eq("brand_id", brandId)
      .eq("action", OUTREACH_ACTION)
      .gte("created_at", since(LOG_DAYS))
      .order("id")
      .range(from, to),
  );
  return rows.flatMap((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const contact = typeof meta.contact === "string" ? meta.contact : "";
    const reason = typeof meta.reason === "string" ? meta.reason : "";
    const kind = meta.kind === "skipped" ? "skipped" : "sent";
    return contact && reason ? [{ contact, reason, kind, at: row.created_at }] : [];
  });
}

export type OutreachRecord = {
  contact: string;
  reason: string;
  kind: "sent" | "skipped";
  customerId: string | null;
  /** What the message was about (a request, a cart, an order), for the record. */
  ref: string;
  /** "Fatima: back in stock", in both languages. */
  summary: { ar: string; en: string };
};

/**
 * Keeps a message sent or a reason put away. Unlike the screens' best-effort log entries, a
 * failure is thrown: this record is what keeps a client from being offered again tomorrow.
 */
export async function recordOutreach(brandId: string, record: OutreachRecord) {
  const { error } = await supabase.from("activity_logs").insert({
    brand_id: brandId,
    action: OUTREACH_ACTION,
    message_ar: record.summary.ar,
    message_en: record.summary.en,
    metadata: {
      contact: record.contact,
      reason: record.reason,
      kind: record.kind,
      customer_id: record.customerId,
      ref: record.ref,
    } as Json,
  });
  if (error) throw error;
}

/** A client's answer about hearing from the store, as their card shows it. */
export async function fetchCustomerConsent(brandId: string, customerId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, marketing_consent, opted_out_at")
    .eq("brand_id", brandId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Records the client's answer: yes (consent, and any earlier opt-out lifted) or no (opted out
 * now). The activity log keeps who recorded it and when, since the column keeps no date.
 */
export async function setCustomerConsent(
  brandId: string,
  customer: { id: string; name: string | null },
  agreed: boolean,
) {
  const { data, error } = await supabase
    .from("customers")
    .update({ marketing_consent: agreed, opted_out_at: agreed ? null : new Date().toISOString() })
    .eq("brand_id", brandId)
    .eq("id", customer.id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("CUSTOMER_NOT_FOUND");
  const name = customer.name?.trim() || "—";
  await supabase.from("activity_logs").insert({
    brand_id: brandId,
    action: CONSENT_ACTION,
    message_ar: agreed
      ? `${name} وافق على استلام رسائل المتجر`
      : `${name} لا يرغب باستلام رسائل المتجر`,
    message_en: agreed
      ? `${name} agreed to hear from the store`
      : `${name} asked not to receive the store's messages`,
    metadata: { customer_id: customer.id, agreed } as Json,
  });
}

/** After a message or an answer: the page's record, the client's card and the audience. */
export function invalidateOutreach(qc: QueryClient, brandId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: outreachKeys.all(brandId) }),
    qc.invalidateQueries({ queryKey: customersKeys.audience(brandId) }),
  ]);
}

export const outreachQueries = {
  orders: (brandId: string) =>
    queryOptions({
      queryKey: outreachKeys.orders(brandId),
      queryFn: () => fetchOutreachOrders(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
  log: (brandId: string) =>
    queryOptions({
      queryKey: outreachKeys.log(brandId),
      queryFn: () => fetchOutreachLog(brandId),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
  consent: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: outreachKeys.consent(brandId, customerId),
      queryFn: () => fetchCustomerConsent(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
};
