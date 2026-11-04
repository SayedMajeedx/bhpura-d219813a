import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ordersKeys } from "./keys";
import type {
  AlterationChange,
  OrderAlteration,
  AlterationKind,
  AlterationMaker,
  AlterationStatus,
} from "@/features/orders/lib/alterations";

/**
 * An order's alterations (migration `20261117100000`): read by order staff (and finance staff),
 * written only through `create_order_alteration` and `set_order_alteration_status`. They sit
 * under the order's keys, so refreshing the order refreshes them.
 */

export const alterationKeys = {
  forOrder: (brandId: string, orderId: string) =>
    [...ordersKeys.all(brandId), "alterations", orderId] as const,
  numbers: (brandId: string, ids: readonly string[]) =>
    [...ordersKeys.all(brandId), "order-numbers", [...ids].sort().join(",")] as const,
};

type Row = Record<string, unknown>;
const KINDS: AlterationKind[] = ["alteration", "fix"];
const MAKERS: AlterationMaker[] = ["supplier", "in_house"];
const STATUSES: AlterationStatus[] = ["open", "at_workshop", "back", "handed_over", "cancelled"];
const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T) =>
  list.includes(v as T) ? (v as T) : fallback;

export function toAlterations(data: unknown): OrderAlteration[] {
  return (Array.isArray(data) ? (data as Row[]) : []).map((row) => ({
    id: String(row.id ?? ""),
    order_id: String(row.order_id ?? ""),
    source_order_id: String(row.source_order_id ?? ""),
    source_item_id: String(row.source_item_id ?? ""),
    kind: pick(row.kind, KINDS, "alteration"),
    changes: (Array.isArray(row.changes) ? row.changes : []) as AlterationChange[],
    note: text(row.note),
    made_by: pick(row.made_by, MAKERS, "supplier"),
    purchase_order_item_id: text(row.purchase_order_item_id),
    customer_charge: Number(row.customer_charge) || 0,
    charge_item_id: text(row.charge_item_id),
    due_at: text(row.due_at),
    status: pick(row.status, STATUSES, "at_workshop"),
    created_at: String(row.created_at ?? ""),
    back_at: text(row.back_at),
    handed_over_at: text(row.handed_over_at),
  }));
}

/** The alterations an order is part of: of its pieces, or charged on it. */
export async function fetchOrderAlterations(
  brandId: string,
  orderId: string,
): Promise<OrderAlteration[]> {
  const { data, error } = await supabase
    .from("order_alterations")
    .select("*")
    .eq("brand_id", brandId)
    .or(`source_order_id.eq.${orderId},order_id.eq.${orderId}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return toAlterations(data);
}

/** The numbers of a few orders (a linked order and its original). */
export async function fetchOrderNumbers(
  brandId: string,
  ids: readonly string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("orders")
    .select("id, invoice_number")
    .eq("brand_id", brandId)
    .in("id", [...ids]);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.id, row.invoice_number]));
}

export const alterationQueries = {
  forOrder: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: alterationKeys.forOrder(brandId, orderId),
      queryFn: () => fetchOrderAlterations(brandId, orderId),
      enabled: Boolean(brandId && orderId),
    }),
  numbers: (brandId: string, ids: readonly string[]) =>
    queryOptions({
      queryKey: alterationKeys.numbers(brandId, ids),
      queryFn: () => fetchOrderNumbers(brandId, ids),
      enabled: Boolean(brandId) && ids.length > 0,
      staleTime: 5 * 60_000,
    }),
};

export type CreateAlterationArgs = {
  p_source_item_id: string;
  p_kind: AlterationKind;
  p_changes: AlterationChange[];
  p_note: string | null;
  p_made_by: AlterationMaker;
  p_vendor_id: string | null;
  p_po_id: string | null;
  p_expected_at: string | null;
  p_supplier_cost: number | null;
  p_customer_charge: number;
  p_request_id: string;
};

export type CreatedAlteration = {
  id: string;
  order_id: string;
  po_id: string | null;
  linked: boolean;
  repeated: boolean;
};

/** Sends a piece for an alteration or a fix; the database decides where it is charged. */
export async function createOrderAlteration(
  args: CreateAlterationArgs,
): Promise<CreatedAlteration> {
  // The generated types read the function's nullable arguments (a fix's vendor, a note) as
  // required: SQL arguments with no default.
  const params =
    args as unknown as Database["public"]["Functions"]["create_order_alteration"]["Args"];
  const { data, error } = await supabase.rpc("create_order_alteration", params);
  if (error) throw error;
  const row = (data ?? {}) as Row;
  return {
    id: String(row.id ?? ""),
    order_id: String(row.order_id ?? ""),
    po_id: text(row.po_id),
    linked: row.linked === true,
    repeated: row.repeated === true,
  };
}

export async function setAlterationStatus(
  id: string,
  status: Extract<AlterationStatus, "back" | "handed_over" | "cancelled">,
): Promise<void> {
  const { error } = await supabase.rpc("set_order_alteration_status", {
    p_id: id,
    p_status: status,
  });
  if (error) throw error;
}
