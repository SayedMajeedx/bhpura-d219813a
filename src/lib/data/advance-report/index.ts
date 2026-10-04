import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The orders the advance-payment report reads: those placed under an advance rule
 * (`advance_percent` is written by the database only then), newest first, within a period.
 */

const COLUMNS =
  "id, invoice_number, created_at, currency, total, advance_paid, status, payment_status, customer_name_snapshot, customer_phone_snapshot, public_invoice_token" as const;

/** Supabase returns at most this many rows; a longer period says so instead of hiding it. */
export const ADVANCE_REPORT_LIMIT = 1000;

export const advanceReportKeys = {
  all: (brandId: string) => ["advance-report", brandId] as const,
  period: (brandId: string, days: number | null) =>
    [...advanceReportKeys.all(brandId), days] as const,
};

/** `days` null reads every period. */
export async function fetchAdvanceReportOrders(brandId: string, days: number | null) {
  let query = supabase
    .from("orders")
    .select(COLUMNS)
    .eq("brand_id", brandId)
    .not("advance_percent", "is", null)
    .order("created_at", { ascending: false })
    .limit(ADVANCE_REPORT_LIMIT);
  if (days !== null) {
    query = query.gte(
      "created_at",
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export const advanceReportQueries = {
  orders: (brandId: string, days: number | null) =>
    queryOptions({
      queryKey: advanceReportKeys.period(brandId, days),
      queryFn: () => fetchAdvanceReportOrders(brandId, days),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
};
