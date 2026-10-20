import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAll } from "../read-all";
import { catalogKeys } from "../catalog/keys";
import type {
  SupplierOrder,
  SupplierOrderLine,
  SupplierOrderStatus,
} from "@/features/supplier-orders/lib/order-state";
import type { LineValues, SavePlan } from "@/features/supplier-orders/lib/order-form";

/**
 * Supplier orders (a tailor's order): the `purchase_orders` of a store with their lines, what
 * arrived, and the receiving. Read and written by staff who see the store's finances (the
 * tables' row policies); receiving also needs `manage_inventory` and goes through
 * `receive_purchase_order`, which adds the pieces to the stock and sets their cost (migration
 * `20261019100000`). The state and the total are the database's: a screen never writes them.
 */

export const supplierOrderKeys = {
  all: (brandId: string) => ["supplier-orders", brandId] as const,
  list: (brandId: string) => [...supplierOrderKeys.all(brandId), "list"] as const,
  detail: (brandId: string, id: string) =>
    [...supplierOrderKeys.all(brandId), "detail", id] as const,
  receipts: (brandId: string, id: string) =>
    [...supplierOrderKeys.all(brandId), "receipts", id] as const,
  payments: (brandId: string, id: string) =>
    [...supplierOrderKeys.all(brandId), "payments", id] as const,
  /** A customer's order's pieces with suppliers (by its order lines). */
  orderPieces: (brandId: string, orderItemIds: readonly string[]) =>
    [...supplierOrderKeys.all(brandId), "order-pieces", ...orderItemIds] as const,
  lastPrices: (brandId: string, vendorId: string, productIds: readonly string[]) =>
    [...supplierOrderKeys.all(brandId), "last-prices", vendorId, ...productIds] as const,
};

const ORDER_SELECT =
  "id, po_number, status, vendor_id, total_amount, paid_amount, expected_at, received_at, created_at, notes, vendors(name, phone), purchase_order_items(id, variant_id, product_id, order_item_id, description, quantity, received_quantity, unit_cost, line_total, sort_order, order_items(order_id, orders(invoice_number)))";

type OrderRow = {
  id: string;
  po_number: string;
  status: string;
  vendor_id: string;
  total_amount: number | string;
  paid_amount: number | string;
  expected_at: string | null;
  received_at: string | null;
  created_at: string;
  notes: string | null;
  vendors: { name: string; phone: string | null } | null;
  purchase_order_items: Array<
    Omit<SupplierOrderLine, "unit_cost" | "line_total" | "customer_order"> & {
      order_items?: {
        order_id: string;
        orders: { invoice_number: number | string | null } | null;
      } | null;
      unit_cost: number | string;
      line_total: number | string;
    }
  > | null;
};

function toOrder(row: OrderRow): SupplierOrder {
  return {
    id: row.id,
    po_number: row.po_number,
    status: row.status as SupplierOrderStatus,
    vendor_id: row.vendor_id,
    vendor_name: row.vendors?.name ?? "",
    vendor_phone: row.vendors?.phone ?? null,
    total_amount: Number(row.total_amount) || 0,
    paid_amount: Number(row.paid_amount) || 0,
    expected_at: row.expected_at,
    received_at: row.received_at,
    created_at: row.created_at,
    notes: row.notes,
    items: (row.purchase_order_items ?? [])
      .map(({ order_items: customerLine, ...line }) => ({
        ...line,
        unit_cost: Number(line.unit_cost) || 0,
        line_total: Number(line.line_total) || 0,
        customer_order: customerLine
          ? {
              id: customerLine.order_id,
              invoice_number: customerLine.orders?.invoice_number ?? null,
            }
          : null,
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

/** Every supplier order of the store with its lines, newest first. */
export async function fetchSupplierOrders(brandId: string): Promise<SupplierOrder[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("purchase_orders")
      .select(ORDER_SELECT, { count: "exact" })
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return (rows as unknown as OrderRow[]).map(toOrder);
}

/** One order, or null when it is not (or no longer) there. */
export async function fetchSupplierOrder(
  brandId: string,
  orderId: string,
): Promise<SupplierOrder | null> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(ORDER_SELECT)
    .eq("brand_id", brandId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data ? toOrder(data as unknown as OrderRow) : null;
}

export type SupplierReceipt = {
  id: string;
  item_id: string;
  variant_id: string | null;
  request_id: string;
  quantity: number;
  unit_cost: number;
  cost_before: number;
  cost_after: number;
  note: string | null;
  received_at: string;
};

/** What arrived for one order, in the order it arrived. */
export async function fetchSupplierReceipts(
  brandId: string,
  orderId: string,
): Promise<SupplierReceipt[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("purchase_order_receipts")
      .select(
        "id, item_id, variant_id, request_id, quantity, unit_cost, cost_before, cost_after, note, received_at",
        { count: "exact" },
      )
      .eq("brand_id", brandId)
      .eq("po_id", orderId)
      .order("received_at")
      .order("id")
      .range(from, to),
  );
  return rows.map((row) => ({
    ...row,
    unit_cost: Number(row.unit_cost) || 0,
    cost_before: Number(row.cost_before) || 0,
    cost_after: Number(row.cost_after) || 0,
  }));
}

export type SupplierPayment = {
  id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

/** The payments to the supplier of one order, the ones taken back included, oldest first. */
export async function fetchSupplierPayments(
  brandId: string,
  orderId: string,
): Promise<SupplierPayment[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("purchase_order_payments")
      .select("id, amount, paid_on, note, created_at, voided_at, void_reason", { count: "exact" })
      .eq("brand_id", brandId)
      .eq("po_id", orderId)
      .order("paid_on")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
}

export type OrderSupplierPiece = {
  id: string;
  order_item_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  po_id: string;
  po_number: string;
  po_status: SupplierOrderStatus;
  expected_at: string | null;
  vendor_id: string;
  vendor_name: string;
};

/**
 * Where a customer's order's pieces are with suppliers: each sent line with its supplier order
 * (a cancelled one is left out: the piece is no longer awaited from it).
 */
export async function fetchOrderSupplierPieces(
  brandId: string,
  orderItemIds: readonly string[],
): Promise<OrderSupplierPiece[]> {
  if (orderItemIds.length === 0) return [];
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select(
      "id, order_item_id, quantity, received_quantity, unit_cost, po_id, purchase_orders!inner(po_number, status, expected_at, brand_id, vendor_id, vendors(name))",
    )
    .in("order_item_id", [...orderItemIds])
    .eq("purchase_orders.brand_id", brandId)
    .neq("purchase_orders.status", "cancelled")
    .limit(200);
  if (error) throw error;
  type Row = {
    id: string;
    order_item_id: string;
    quantity: number;
    received_quantity: number;
    unit_cost: number | string;
    po_id: string;
    purchase_orders: {
      po_number: string;
      status: string;
      expected_at: string | null;
      vendor_id: string;
      vendors: { name: string } | null;
    };
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    order_item_id: row.order_item_id,
    quantity: row.quantity,
    received_quantity: row.received_quantity,
    unit_cost: Number(row.unit_cost) || 0,
    po_id: row.po_id,
    po_number: row.purchase_orders.po_number,
    po_status: row.purchase_orders.status as SupplierOrderStatus,
    expected_at: row.purchase_orders.expected_at,
    vendor_id: row.purchase_orders.vendor_id,
    vendor_name: row.purchase_orders.vendors?.name ?? "",
  }));
}

/**
 * What this supplier last charged for each of these products (a piece's price on its newest
 * order), as a start for what they charge this time: a tailor's price changes, so it is only
 * a suggestion.
 */
export async function fetchLastSupplierPrices(
  brandId: string,
  vendorId: string,
  productIds: readonly string[],
): Promise<Map<string, number>> {
  if (!vendorId || productIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select("product_id, unit_cost, purchase_orders!inner(created_at, brand_id, vendor_id, status)")
    .in("product_id", [...productIds])
    .eq("purchase_orders.brand_id", brandId)
    .eq("purchase_orders.vendor_id", vendorId)
    .neq("purchase_orders.status", "cancelled")
    .gt("unit_cost", 0)
    .limit(500);
  if (error) throw error;
  type Row = {
    product_id: string;
    unit_cost: number | string;
    purchase_orders: { created_at: string };
  };
  const newest = new Map<string, { at: string; cost: number }>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const seen = newest.get(row.product_id);
    if (!seen || row.purchase_orders.created_at > seen.at) {
      newest.set(row.product_id, {
        at: row.purchase_orders.created_at,
        cost: Number(row.unit_cost),
      });
    }
  }
  return new Map([...newest].map(([id, { cost }]) => [id, cost]));
}

export const supplierOrderQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: supplierOrderKeys.list(brandId),
      queryFn: () => fetchSupplierOrders(brandId),
      enabled: Boolean(brandId),
    }),
  detail: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: supplierOrderKeys.detail(brandId, orderId),
      queryFn: () => fetchSupplierOrder(brandId, orderId),
      enabled: Boolean(brandId && orderId),
    }),
  receipts: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: supplierOrderKeys.receipts(brandId, orderId),
      queryFn: () => fetchSupplierReceipts(brandId, orderId),
      enabled: Boolean(brandId && orderId),
    }),
  orderPieces: (brandId: string, orderItemIds: readonly string[]) =>
    queryOptions({
      queryKey: supplierOrderKeys.orderPieces(brandId, orderItemIds),
      queryFn: () => fetchOrderSupplierPieces(brandId, orderItemIds),
      enabled: Boolean(brandId) && orderItemIds.length > 0,
    }),
  lastPrices: (brandId: string, vendorId: string, productIds: readonly string[]) =>
    queryOptions({
      queryKey: supplierOrderKeys.lastPrices(brandId, vendorId, productIds),
      queryFn: () => fetchLastSupplierPrices(brandId, vendorId, productIds),
      enabled: Boolean(brandId && vendorId) && productIds.length > 0,
    }),
  payments: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: supplierOrderKeys.payments(brandId, orderId),
      queryFn: () => fetchSupplierPayments(brandId, orderId),
      enabled: Boolean(brandId && orderId),
    }),
};

/** After a change: every list and order of the store (the expenses page reads the list too). */
export function invalidateSupplierOrders(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: supplierOrderKeys.all(brandId) });
}

const lineRow = (orderId: string, values: LineValues) => ({ po_id: orderId, ...values });

async function writeLines(orderId: string, plan: Pick<SavePlan, "insert" | "update" | "remove">) {
  if (plan.remove.length) {
    const { error } = await supabase
      .from("purchase_order_items")
      .delete()
      .eq("po_id", orderId)
      .in("id", plan.remove);
    if (error) throw error;
  }
  for (const { id, values } of plan.update) {
    const { error } = await supabase
      .from("purchase_order_items")
      .update(values)
      .eq("po_id", orderId)
      .eq("id", id);
    if (error) throw error;
  }
  if (plan.insert.length) {
    const { error } = await supabase
      .from("purchase_order_items")
      .insert(plan.insert.map((values) => lineRow(orderId, values)));
    if (error) throw error;
  }
}

/**
 * A new order: written as a draft, its lines added, then placed (or left a draft). A failure
 * while adding the lines removes the draft, so no order is left without its lines. What was paid
 * up front is a payment of its own (`recordSupplierPayment`), recorded once the order exists.
 */
export async function createSupplierOrder(
  brandId: string,
  plan: SavePlan,
  options: { place: boolean },
): Promise<string> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({ ...plan.order, brand_id: brandId, po_number: "", status: "draft" })
    .select("id")
    .single();
  if (error) throw error;
  try {
    await writeLines(data.id, plan);
  } catch (lineError) {
    await supabase.from("purchase_orders").delete().eq("id", data.id).eq("brand_id", brandId);
    throw lineError;
  }
  if (options.place) await setSupplierOrderStatus(brandId, data.id, "ordered");
  return data.id;
}

/** Saves an order's fields and lines (`planSave` against its saved lines). */
export async function updateSupplierOrder(brandId: string, orderId: string, plan: SavePlan) {
  const { error } = await supabase
    .from("purchase_orders")
    .update(plan.order)
    .eq("id", orderId)
    .eq("brand_id", brandId);
  if (error) throw error;
  await writeLines(orderId, plan);
}

/** Places a draft, or cancels an order nothing of which has arrived. */
export async function setSupplierOrderStatus(
  brandId: string,
  orderId: string,
  status: "ordered" | "cancelled",
) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status })
    .eq("id", orderId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("PURCHASE_ORDER_NOT_FOUND");
}

/** Deletes an order nothing of which has arrived. */
export async function deleteSupplierOrder(brandId: string, orderId: string) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", orderId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("PURCHASE_ORDER_NOT_FOUND");
}

/**
 * A payment to the supplier of an order (never more than is still owed; the database keeps the
 * order's paid amount). Not an expense: the cost of goods is counted when a piece sells.
 * `requestId` is one press of the button.
 */
export async function recordSupplierPayment(
  orderId: string,
  payment: { amount: number; paidOn: string; requestId: string; note: string | null },
): Promise<string> {
  const { data, error } = await supabase.rpc("record_supplier_payment", {
    p_po_id: orderId,
    p_amount: payment.amount,
    p_paid_on: payment.paidOn,
    p_request_id: payment.requestId,
    p_note: payment.note?.trim() || undefined,
  });
  if (error) throw error;
  return data as string;
}

/** Takes a payment back: it stays on record with the reason, and counts nowhere. */
export async function voidSupplierPayment(paymentId: string, reason: string) {
  const { error } = await supabase.rpc("void_supplier_payment", {
    p_payment_id: paymentId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

/**
 * Receives what arrived: adds the pieces to the store's stock and sets each size's cost, in one
 * transaction. `requestId` is one press of the button (sent again, it changes nothing).
 */
export async function receiveSupplierOrder(
  orderId: string,
  lines: Array<{ item_id: string; quantity: number }>,
  requestId: string,
  note?: string,
): Promise<{ status: SupplierOrderStatus; repeated: boolean }> {
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    p_po_id: orderId,
    p_lines: lines,
    p_request_id: requestId,
    p_note: note?.trim() || undefined,
  });
  if (error) throw error;
  return data as unknown as { status: SupplierOrderStatus; repeated: boolean };
}

/** After a receipt: the orders, and the catalog's stock and costs the inventory shows. */
export function invalidateAfterReceipt(qc: QueryClient, brandId: string) {
  return Promise.all([
    invalidateSupplierOrders(qc, brandId),
    qc.invalidateQueries({ queryKey: catalogKeys.variants(brandId) }),
    qc.invalidateQueries({ queryKey: catalogKeys.products(brandId) }),
  ]);
}

/**
 * Sends a customer's workshop lines to a supplier in one transaction: on one of the supplier's
 * open orders (`poId`) or a new one due `expectedAt`, each at the price the tailor asked this
 * time; the customer's order moves to "sent to the workshop". Returns the supplier order's id.
 */
export async function sendOrderToSupplier(
  orderId: string,
  send: {
    vendorId: string;
    poId: string | null;
    lines: Array<{ order_item_id: string; unit_cost: number }>;
    expectedAt: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("send_order_to_supplier", {
    p_order_id: orderId,
    p_vendor_id: send.vendorId,
    // Null makes a new order: the function takes it, though the generated type names a string.
    p_po_id: send.poId as string,
    p_lines: send.lines,
    p_expected_at: send.expectedAt ?? undefined,
  });
  if (error) throw error;
  return data as string;
}
