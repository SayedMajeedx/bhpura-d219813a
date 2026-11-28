import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAll } from "../read-all";

/**
 * A store's full stock counts (migration 20261231100000): the counts, the sizes each counts with
 * what was found, and the database's functions that start one, record a count, say what it found
 * and apply it through the ledger. Every write goes through those functions (staff with
 * `manage_inventory`); a browser writes no row itself.
 */

export const stockCountKeys = {
  all: (brandId: string) => ["stock-counts", brandId] as const,
  list: (brandId: string) => [...stockCountKeys.all(brandId), "list"] as const,
  lines: (brandId: string, countId: string) =>
    [...stockCountKeys.all(brandId), "lines", countId] as const,
  review: (brandId: string, countId: string) =>
    [...stockCountKeys.all(brandId), "review", countId] as const,
};

export type StockCount = {
  id: string;
  number: number;
  category: string | null;
  note: string | null;
  status: "counting" | "applied" | "cancelled";
  started_at: string;
  finished_at: string | null;
};

/** The store's counts, the latest first. */
export async function fetchStockCounts(brandId: string): Promise<StockCount[]> {
  const { data, error } = await supabase
    .from("stock_counts")
    .select("id, number, category, note, status, started_at, finished_at")
    .eq("brand_id", brandId)
    .order("number", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as StockCount[];
}

export type StockCountLine = {
  variant_id: string;
  product_id: string | null;
  expected: number;
  counted: number | null;
  counted_at: string | null;
  applied_delta: number | null;
  product_variants: {
    size: string | null;
    color: string | null;
    sku: string | null;
    barcode: string | null;
  } | null;
  products: { name: string | null; name_ar: string | null; name_en: string | null } | null;
};

/** Every size a count counts, with its piece and product names, read to the end. */
export async function fetchStockCountLines(countId: string): Promise<StockCountLine[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("stock_count_lines")
      .select(
        "variant_id, product_id, expected, counted, counted_at, applied_delta, product_variants(size, color, sku, barcode), products(name, name_ar, name_en)",
        { count: "exact" },
      )
      .eq("count_id", countId)
      .order("variant_id")
      .range(from, to),
  );
  return rows as unknown as StockCountLine[];
}

export type StockCountFinding = {
  variant_id: string;
  expected: number;
  counted: number | null;
  moved_during: number;
  difference: number | null;
  stock_now: number;
};

/** What a count found: each size's moves during it and its difference (the database's rule). */
export async function fetchStockCountReview(countId: string): Promise<StockCountFinding[]> {
  const { data, error } = await supabase.rpc("stock_count_review", { p_count_id: countId });
  if (error) throw error;
  return (data ?? []) as unknown as StockCountFinding[];
}

export const stockCountQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: stockCountKeys.list(brandId),
      queryFn: () => fetchStockCounts(brandId),
      enabled: Boolean(brandId),
    }),
  lines: (brandId: string, countId: string | null) =>
    queryOptions({
      queryKey: stockCountKeys.lines(brandId, countId ?? ""),
      queryFn: () => fetchStockCountLines(countId ?? ""),
      enabled: Boolean(brandId && countId),
    }),
  review: (brandId: string, countId: string | null, enabled = true) =>
    queryOptions({
      queryKey: stockCountKeys.review(brandId, countId ?? ""),
      queryFn: () => fetchStockCountReview(countId ?? ""),
      enabled: Boolean(brandId && countId) && enabled,
    }),
};

export function invalidateStockCounts(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: stockCountKeys.all(brandId) });
}

export async function startStockCount(brandId: string, category: string | null, note: string) {
  const { data, error } = await supabase.rpc("start_stock_count", {
    p_brand_id: brandId,
    ...(category ? { p_category: category } : {}),
    ...(note.trim() ? { p_note: note.trim() } : {}),
  });
  if (error) throw error;
  return data as unknown as { id: string; number: number; sizes: number };
}

/** A scan adds one (`add`), a typed number sets it (`set`), `clear` takes it back. */
export async function recordStockCount(
  countId: string,
  variantId: string,
  mode: "add" | "set" | "clear",
  value?: number,
) {
  const { data, error } = await supabase.rpc("record_stock_count", {
    p_count_id: countId,
    p_variant_id: variantId,
    p_mode: mode,
    ...(value === undefined ? {} : { p_value: value }),
  });
  if (error) throw error;
  return data as unknown as { variant_id: string; counted: number | null; expected: number };
}

export async function applyStockCount(countId: string) {
  const { data, error } = await supabase.rpc("apply_stock_count", { p_count_id: countId });
  if (error) throw error;
  return data as unknown as { changed: number; pieces: number };
}

export async function cancelStockCount(countId: string) {
  const { error } = await supabase.rpc("cancel_stock_count", { p_count_id: countId });
  if (error) throw error;
}
