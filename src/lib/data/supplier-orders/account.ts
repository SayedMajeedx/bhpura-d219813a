import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAll } from "../read-all";
import { supplierOrderKeys } from "./index";
import type {
  AccountPayment,
  EntryKind,
  PaymentMethod,
} from "@/features/supplier-orders/lib/supplier-account";

/**
 * A supplier's payments (migration `20261127100000`): a payment is the supplier's, with its day,
 * how it was paid and its reference, and what it paid on each of their orders is a row of
 * `purchase_order_payments` naming it. Recorded and taken back by the database, which spreads
 * each payment and keeps the rest as the supplier's credit. Staff who see the store's finances
 * only (the row policies and the functions' own checks).
 */

const PAYMENT_COLUMNS =
  "id, vendor_id, amount, paid_on, kind, method, reference, note, created_at, voided_at, void_reason, purchase_order_payments(po_id, amount, voided_at, purchase_orders(po_number))";

/** Every payment to the store's suppliers, the ones taken back included, oldest first. */
export async function fetchSupplierAccountPayments(brandId: string): Promise<AccountPayment[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("supplier_payments")
      .select(PAYMENT_COLUMNS, { count: "exact" })
      .eq("brand_id", brandId)
      .order("paid_on")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    vendor_id: row.vendor_id,
    amount: Number(row.amount) || 0,
    paid_on: row.paid_on,
    kind: (row.kind as EntryKind | null) ?? "payment",
    method: (row.method as PaymentMethod | null) ?? null,
    reference: row.reference,
    note: row.note,
    created_at: row.created_at,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    applied: (row.purchase_order_payments ?? []).map((a) => ({
      po_id: a.po_id,
      po_number: a.purchase_orders?.po_number ?? "",
      amount: Number(a.amount) || 0,
      voided: Boolean(a.voided_at),
    })),
  }));
}

export const supplierAccountQueries = {
  payments: (brandId: string) =>
    queryOptions({
      // Under the supplier orders' key, so saving an order or a payment refreshes both.
      queryKey: [...supplierOrderKeys.all(brandId), "account-payments"] as const,
      queryFn: () => fetchSupplierAccountPayments(brandId),
      enabled: Boolean(brandId),
    }),
};

/**
 * A payment to a supplier: spread on the orders chosen (each at most what it owes), then on the
 * oldest that owe; what is left is their credit with the store. `requestId` is one press.
 */
export async function recordSupplierAccountPayment(payment: {
  vendorId: string;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  allocations: { poId: string; amount: number }[];
  requestId: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("record_supplier_account_payment", {
    p_vendor_id: payment.vendorId,
    p_amount: payment.amount,
    p_paid_on: payment.paidOn,
    p_method: payment.method,
    // Empty text is kept as nothing, and no orders chosen means the oldest first.
    p_reference: payment.reference?.trim() ?? "",
    p_note: payment.note?.trim() ?? "",
    p_allocations: payment.allocations.map((a) => ({ po_id: a.poId, amount: a.amount })),
    p_request_id: payment.requestId,
  });
  if (error) throw error;
  return data as string;
}

/** Takes a whole payment back: it stays on record with the reason, and counts nowhere. */
export async function voidSupplierAccountPayment(paymentId: string, reason: string) {
  const { error } = await supabase.rpc("void_supplier_account_payment", {
    p_payment_id: paymentId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

/**
 * An adjustment to a supplier's account: a discount they gave or an amount written off, with
 * its reason, spread on the orders as a payment is. It moves no money. `requestId` is one press.
 */
export async function recordSupplierAdjustment(adjustment: {
  vendorId: string;
  amount: number;
  on: string;
  kind: Exclude<EntryKind, "payment">;
  reason: string;
  allocations: { poId: string; amount: number }[];
  requestId: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("record_supplier_adjustment", {
    p_vendor_id: adjustment.vendorId,
    p_amount: adjustment.amount,
    p_on: adjustment.on,
    p_kind: adjustment.kind,
    p_reason: adjustment.reason.trim(),
    p_allocations: adjustment.allocations.map((a) => ({ po_id: a.poId, amount: a.amount })),
    p_request_id: adjustment.requestId,
  });
  if (error) throw error;
  return data as string;
}
