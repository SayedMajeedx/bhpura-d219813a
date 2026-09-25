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

/** Sets a cash account's balance (scoped to the brand). */
export async function setCashAccountBalance(brandId: string, accountId: string, balance: number) {
  const { error } = await supabase
    .from("cash_flow_accounts")
    .update({ balance })
    .eq("id", accountId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Logs a movement between the brand's cash accounts. */
export async function recordAccountTransaction(
  brandId: string,
  transaction: Omit<TablesInsert<"account_transactions">, "brand_id">,
) {
  const { error } = await supabase
    .from("account_transactions")
    .insert({ ...transaction, brand_id: brandId });
  if (error) throw error;
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
