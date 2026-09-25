import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * Incubators (consignment partners): the partners, the stock held at each,
 * their sales and the payments received, plus the stock moves between the
 * store and a partner. Everything sits under `["incubators", brandId]`, so one
 * `invalidateIncubators` refreshes the page and the batch transfer modal.
 * Stock moves also change the variants' main stock: refresh the catalog too.
 */

export const incubatorsKeys = {
  all: (brandId: string) => ["incubators", brandId] as const,
  list: (brandId: string) => [...incubatorsKeys.all(brandId), "list"] as const,
  active: (brandId: string) => [...incubatorsKeys.all(brandId), "active"] as const,
  inventory: (brandId: string) => [...incubatorsKeys.all(brandId), "inventory"] as const,
  sales: (brandId: string) => [...incubatorsKeys.all(brandId), "sales"] as const,
  payments: (brandId: string) => [...incubatorsKeys.all(brandId), "payments"] as const,
  /** Variants with main stock left, for the transfer picker. */
  transferOptions: (brandId: string) =>
    [...incubatorsKeys.all(brandId), "transfer-options"] as const,
  /** Some products' variants with what each incubator holds (batch transfer). */
  batchVariants: (brandId: string, productIds: readonly string[]) =>
    [...incubatorsKeys.all(brandId), "batch-variants", productIds.join(",")] as const,
};

// ── Reads ───────────────────────────────────────────────────────────────────

/** The brand's incubators by name. */
export async function fetchIncubators(brandId: string) {
  const { data, error } = await supabase
    .from("incubators")
    .select("*")
    .eq("brand_id", brandId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** The brand's active incubators, oldest first, with their commission terms. */
export async function fetchActiveIncubators(brandId: string) {
  const { data, error } = await supabase
    .from("incubators")
    .select("id, name, commission_type, commission_value, currency, settlement_day, is_active")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Stock held at every incubator with its variant and product, latest change first. */
export async function fetchIncubatorInventory(brandId: string) {
  const { data, error } = await supabase
    .from("incubator_inventory")
    .select(
      "*, product_variants(id,sku,barcode,size,color,stock_main,selling_price,products(id,name,name_ar,image_url))",
    )
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Every incubator sale with its variant's SKU and product name, newest first. */
export async function fetchIncubatorSales(brandId: string) {
  const { data, error } = await supabase
    .from("incubator_sales")
    .select("*, product_variants(sku,products(name,name_ar))")
    .eq("brand_id", brandId)
    .order("sold_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Every payment received from incubators, newest first. */
export async function fetchIncubatorPayments(brandId: string) {
  const { data, error } = await supabase
    .from("incubator_payments")
    .select("*")
    .eq("brand_id", brandId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** The brand's variants that still have main stock, by SKU (transfer picker). */
export async function fetchTransferOptions(brandId: string) {
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id,sku,barcode,size,color,stock_main,selling_price,products!inner(name,name_ar,brand_id)",
    )
    .eq("products.brand_id", brandId)
    .gt("stock_main", 0)
    .order("sku");
  if (error) throw error;
  return data ?? [];
}

/** Some products' variants with the stock each incubator holds of them. */
export async function fetchBatchTransferVariants(brandId: string, productIds: readonly string[]) {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, sku, barcode, size, color, stock_main, stock_incubator, selling_price, cost_price, incubator_inventory(quantity, incubator_id)",
    )
    .eq("brand_id", brandId)
    .in("product_id", [...productIds]);
  if (error) throw error;
  return data ?? [];
}

export const incubatorsQueries = {
  batchVariants: (brandId: string, productIds: readonly string[]) =>
    queryOptions({
      queryKey: incubatorsKeys.batchVariants(brandId, productIds),
      queryFn: () => fetchBatchTransferVariants(brandId, productIds),
      enabled: Boolean(brandId) && productIds.length > 0,
      staleTime: 10_000,
    }),
  list: (brandId: string) =>
    queryOptions({
      queryKey: incubatorsKeys.list(brandId),
      queryFn: () => fetchIncubators(brandId),
      enabled: Boolean(brandId),
    }),
  active: (brandId: string) =>
    queryOptions({
      queryKey: incubatorsKeys.active(brandId),
      queryFn: () => fetchActiveIncubators(brandId),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
  inventory: (brandId: string) =>
    queryOptions({
      queryKey: incubatorsKeys.inventory(brandId),
      queryFn: () => fetchIncubatorInventory(brandId),
      enabled: Boolean(brandId),
    }),
  sales: (brandId: string) =>
    queryOptions({
      queryKey: incubatorsKeys.sales(brandId),
      queryFn: () => fetchIncubatorSales(brandId),
      enabled: Boolean(brandId),
    }),
  payments: (brandId: string) =>
    queryOptions({
      queryKey: incubatorsKeys.payments(brandId),
      queryFn: () => fetchIncubatorPayments(brandId),
      enabled: Boolean(brandId),
    }),
  transferOptions: (brandId: string) =>
    queryOptions({
      queryKey: incubatorsKeys.transferOptions(brandId),
      queryFn: () => fetchTransferOptions(brandId),
      enabled: Boolean(brandId),
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export type NewIncubator = TablesInsert<"incubators">;
export type IncubatorPatch = TablesUpdate<"incubators">;

/** Everything cached about the brand's incubators is stale after a write. */
export function invalidateIncubators(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: incubatorsKeys.all(brandId) });
}

export async function createIncubator(brandId: string, values: NewIncubator) {
  const { error } = await supabase.from("incubators").insert({ ...values, brand_id: brandId });
  if (error) throw error;
}

export async function updateIncubator(brandId: string, incubatorId: string, patch: IncubatorPatch) {
  const { error } = await supabase
    .from("incubators")
    .update(patch)
    .eq("id", incubatorId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/**
 * Stock moves and money, each one server transaction (the server checks the
 * incubator's brand). Optional text left empty is omitted: the functions
 * default it to NULL.
 */
export async function transferStockToIncubator(args: {
  incubatorId: string;
  variantId: string;
  quantity: number;
  externalCode?: string | null;
  price?: number;
  commissionType?: string;
  commissionValue?: number;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc("transfer_stock_to_incubator", {
    p_incubator_id: args.incubatorId,
    p_variant_id: args.variantId,
    p_quantity: args.quantity,
    p_external_code: args.externalCode ?? undefined,
    p_price: args.price,
    p_commission_type: args.commissionType,
    p_commission_value: args.commissionValue,
    p_notes: args.notes ?? undefined,
  });
  if (error) throw error;
}

export async function returnStockFromIncubator(args: {
  incubatorId: string;
  variantId: string;
  quantity: number;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc("return_stock_from_incubator", {
    p_incubator_id: args.incubatorId,
    p_variant_id: args.variantId,
    p_quantity: args.quantity,
    p_notes: args.notes ?? undefined,
  });
  if (error) throw error;
}

export async function recordIncubatorSale(args: {
  incubatorId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  soldAt: string;
}) {
  const { error } = await supabase.rpc("record_incubator_sale", {
    p_incubator_id: args.incubatorId,
    p_variant_id: args.variantId,
    p_quantity: args.quantity,
    p_unit_price: args.unitPrice,
    p_sold_at: args.soldAt,
  });
  if (error) throw error;
}

/** Undoes a sale and puts the stock back at the incubator. */
export async function reverseIncubatorSale(saleId: string, reason: string) {
  const { error } = await supabase.rpc("reverse_incubator_sale", {
    p_sale_id: saleId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function recordIncubatorPayment(args: {
  incubatorId: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc("record_incubator_payment", {
    p_incubator_id: args.incubatorId,
    p_amount: args.amount,
    p_payment_date: args.paymentDate,
    p_payment_method: args.paymentMethod ?? undefined,
    p_reference: args.reference ?? undefined,
    p_notes: args.notes ?? undefined,
  });
  if (error) throw error;
}

/** Changes a stock line's code, consignment price and commission. */
export async function updateIncubatorItem(args: {
  inventoryId: string;
  externalCode: string;
  consignmentPrice: number;
  commissionType: string;
  commissionValue: number;
}) {
  const { error } = await supabase.rpc("update_incubator_inventory_item", {
    p_inventory_id: args.inventoryId,
    p_external_code: args.externalCode,
    p_consignment_price: args.consignmentPrice,
    p_commission_type: args.commissionType,
    p_commission_value: args.commissionValue,
  });
  if (error) throw error;
}

/** Brings the incubator's consignment prices in line with the store's; returns how many changed. */
export async function syncIncubatorPrices(incubatorId: string): Promise<number> {
  const { data, error } = await supabase.rpc("sync_incubator_inventory_prices", {
    p_incubator_id: incubatorId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
