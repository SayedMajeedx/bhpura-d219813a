import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supplierOrderKeys } from "./index";
import { piecePurpose, type PiecePurpose } from "@/features/supplier-orders/lib/after-sending";
import { isSheetLang, type SheetLang } from "@/features/orders/lib/job-sheet";

/**
 * What every member of order staff may know of the workshop, with no amount (migration
 * `20261116100000`): the store's suppliers with their language, phone and open orders
 * (`workshop_suppliers`), and where an order's pieces are (`order_workshop_pieces`). Staff who
 * cannot see costs read neither `vendors` nor `purchase_orders`, so the send and the job sheet
 * read these instead. Both sit under the supplier orders' keys: refreshing them refreshes these.
 */

export type WorkshopSupplier = {
  id: string;
  name: string;
  phone: string | null;
  language: SheetLang | null;
  openOrders: Array<{ id: string; poNumber: string; expectedAt: string | null }>;
};

export type WorkshopPiece = {
  orderItemId: string;
  itemId: string;
  purpose: PiecePurpose;
  quantity: number;
  receivedQuantity: number;
  pricePending: boolean;
  poId: string;
  poNumber: string;
  expectedAt: string | null;
  vendorId: string;
  vendorName: string;
  vendorPhone: string | null;
  language: SheetLang | null;
};

export const workshopKeys = {
  suppliers: (brandId: string) =>
    [...supplierOrderKeys.all(brandId), "workshop-suppliers"] as const,
  orderPieces: (brandId: string, orderId: string) =>
    [...supplierOrderKeys.all(brandId), "workshop-pieces", orderId] as const,
};

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const count = (value: unknown) => Number(value) || 0;
const language = (value: unknown) => (isSheetLang(value) ? value : null);

export function toWorkshopSuppliers(data: unknown): WorkshopSupplier[] {
  return (Array.isArray(data) ? (data as Row[]) : []).map((row) => ({
    id: text(row.id),
    name: text(row.name),
    phone: textOrNull(row.phone),
    language: language(row.preferred_language),
    openOrders: (Array.isArray(row.open_orders) ? (row.open_orders as Row[]) : []).map((po) => ({
      id: text(po.id),
      poNumber: text(po.po_number),
      expectedAt: textOrNull(po.expected_at),
    })),
  }));
}

export function toWorkshopPieces(data: unknown): WorkshopPiece[] {
  return (Array.isArray(data) ? (data as Row[]) : []).map((row) => ({
    orderItemId: text(row.order_item_id),
    itemId: text(row.item_id),
    purpose: piecePurpose(textOrNull(row.purpose)),
    quantity: count(row.quantity),
    receivedQuantity: count(row.received_quantity),
    pricePending: row.price_pending === true,
    poId: text(row.po_id),
    poNumber: text(row.po_number),
    expectedAt: textOrNull(row.expected_at),
    vendorId: text(row.vendor_id),
    vendorName: text(row.vendor_name),
    vendorPhone: textOrNull(row.vendor_phone),
    language: language(row.preferred_language),
  }));
}

export async function fetchWorkshopSuppliers(brandId: string): Promise<WorkshopSupplier[]> {
  const { data, error } = await supabase.rpc("workshop_suppliers", { p_brand: brandId });
  if (error) throw error;
  return toWorkshopSuppliers(data);
}

export async function fetchOrderWorkshopPieces(orderId: string): Promise<WorkshopPiece[]> {
  const { data, error } = await supabase.rpc("order_workshop_pieces", { p_order_id: orderId });
  if (error) throw error;
  return toWorkshopPieces(data);
}

export const workshopQueries = {
  suppliers: (brandId: string) =>
    queryOptions({
      queryKey: workshopKeys.suppliers(brandId),
      queryFn: () => fetchWorkshopSuppliers(brandId),
      enabled: Boolean(brandId),
    }),
  orderPieces: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: workshopKeys.orderPieces(brandId, orderId),
      queryFn: () => fetchOrderWorkshopPieces(orderId),
      enabled: Boolean(brandId && orderId),
    }),
};

/**
 * Finance staff add the price of a piece sent with none: the database clears the mark (also on
 * a piece that has arrived, whose order line then takes its cost). A write that matched no row
 * is a failure.
 */
export async function setPiecePrice(itemId: string, unitCost: number): Promise<void> {
  const { data, error } = await supabase
    .from("purchase_order_items")
    .update({ unit_cost: unitCost, price_pending: false })
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("PURCHASE_ORDER_LINE_NOT_FOUND");
}
