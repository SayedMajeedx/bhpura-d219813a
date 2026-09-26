import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * The expenses page's accounting tabs: cash accounts (cash box and bank) with
 * their transfer log, vendors and purchase orders. Expenses themselves live in
 * `@/lib/data/expenses`.
 *
 * Everything sits under `["accounting", brandId]`. Before, the cash accounts
 * were read by two tabs under one hand-built key, and the vendors under two
 * keys (all columns, and id + name for the expense form) that a new vendor had
 * to refresh one by one.
 */

export const accountingKeys = {
  all: (brandId: string) => ["accounting", brandId] as const,
  cashAccounts: (brandId: string) => [...accountingKeys.all(brandId), "cash-accounts"] as const,
  /** Every vendor list of the brand (prefix). */
  vendors: (brandId: string) => [...accountingKeys.all(brandId), "vendors"] as const,
  vendorList: (brandId: string) => [...accountingKeys.vendors(brandId), "list"] as const,
  vendorOptions: (brandId: string) => [...accountingKeys.vendors(brandId), "options"] as const,
  purchaseOrders: (brandId: string) => [...accountingKeys.all(brandId), "purchase-orders"] as const,
};

/** The brand's cash accounts (a cash box and a bank account). */
export async function fetchCashFlowAccounts(brandId: string) {
  const { data, error } = await supabase
    .from("cash_flow_accounts")
    .select("*")
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}

/** Every vendor of the brand, newest first. */
export async function fetchVendors(brandId: string) {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** The brand's vendors for a picker (id and name), by name. */
export async function fetchVendorOptions(brandId: string) {
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("brand_id", brandId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Every purchase order of the brand with its vendor's name, newest first. */
export async function fetchPurchaseOrders(brandId: string) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*, vendors(name)")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const accountingQueries = {
  cashAccounts: (brandId: string) =>
    queryOptions({
      queryKey: accountingKeys.cashAccounts(brandId),
      queryFn: () => fetchCashFlowAccounts(brandId),
    }),
  vendors: (brandId: string) =>
    queryOptions({
      queryKey: accountingKeys.vendorList(brandId),
      queryFn: () => fetchVendors(brandId),
    }),
  vendorOptions: (brandId: string) =>
    queryOptions({
      queryKey: accountingKeys.vendorOptions(brandId),
      queryFn: () => fetchVendorOptions(brandId),
    }),
  purchaseOrders: (brandId: string) =>
    queryOptions({
      queryKey: accountingKeys.purchaseOrders(brandId),
      queryFn: () => fetchPurchaseOrders(brandId),
    }),
};

export function invalidateCashAccounts(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: accountingKeys.cashAccounts(brandId) });
}

/** Both vendor lists (the vendors tab and the expense form's picker). */
export function invalidateVendors(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: accountingKeys.vendors(brandId) });
}

export function invalidatePurchaseOrders(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: accountingKeys.purchaseOrders(brandId) });
}

/** Why the database refused a transfer (the codes `transfer_cash_to_bank` raises). */
export type CashTransferRefusal =
  | "INVALID_TRANSFER_AMOUNT"
  | "NOT_AUTHORIZED"
  | "CASH_ACCOUNTS_MISSING"
  | "INSUFFICIENT_CASH_BALANCE";

const CASH_TRANSFER_REFUSALS: readonly CashTransferRefusal[] = [
  "INVALID_TRANSFER_AMOUNT",
  "NOT_AUTHORIZED",
  "CASH_ACCOUNTS_MISSING",
  "INSUFFICIENT_CASH_BALANCE",
];

/** The refusal code in a failed transfer's error, if it is one. */
export function cashTransferRefusal(error: unknown): CashTransferRefusal | null {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return null;
  return CASH_TRANSFER_REFUSALS.find((code) => message.includes(code)) ?? null;
}

/**
 * Moves cash from the brand's cash box to its bank account and logs the move,
 * in one database transaction that refuses more than the cash box holds.
 * Returns the logged transaction's id.
 */
export async function transferCashToBank(brandId: string, amount: number, notes?: string) {
  const { data, error } = await supabase.rpc("transfer_cash_to_bank", {
    p_brand_id: brandId,
    p_amount: amount,
    p_notes: notes?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function createVendor(
  brandId: string,
  vendor: Omit<TablesInsert<"vendors">, "brand_id">,
) {
  const { error } = await supabase.from("vendors").insert({ ...vendor, brand_id: brandId });
  if (error) throw error;
}

export async function createPurchaseOrder(
  brandId: string,
  order: Omit<TablesInsert<"purchase_orders">, "brand_id">,
) {
  const { error } = await supabase.from("purchase_orders").insert({ ...order, brand_id: brandId });
  if (error) throw error;
}

export async function updatePurchaseOrder(
  brandId: string,
  orderId: string,
  patch: TablesUpdate<"purchase_orders">,
) {
  const { error } = await supabase
    .from("purchase_orders")
    .update(patch)
    .eq("id", orderId)
    .eq("brand_id", brandId);
  if (error) throw error;
}
