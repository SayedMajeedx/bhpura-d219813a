import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

/**
 * A brand's loyalty program: its settings, tiers, customer accounts and the
 * points ledger, as the admin Loyalty page, the shopper's account page and
 * checkout read them. Everything sits under `["loyalty", brandId]`, so one
 * `invalidateLoyalty` refreshes it all. (Before, the manual adjustment
 * invalidated `["brand_loyalty_accounts", …]` while the points summary lived
 * under `["brand_loyalty_accounts_summary", …]`, so the KPI cards stayed stale.)
 */

export const loyaltyKeys = {
  all: (brandId: string) => ["loyalty", brandId] as const,
  program: (brandId: string) => [...loyaltyKeys.all(brandId), "program"] as const,
  tiers: (brandId: string) => [...loyaltyKeys.all(brandId), "tiers"] as const,
  ledger: (brandId: string) => [...loyaltyKeys.all(brandId), "ledger"] as const,
  summary: (brandId: string) => [...loyaltyKeys.all(brandId), "summary"] as const,
  account: (brandId: string, customerId: string) =>
    [...loyaltyKeys.all(brandId), "account", customerId] as const,
  customerLedger: (brandId: string, customerId: string) =>
    [...loyaltyKeys.all(brandId), "customer-ledger", customerId] as const,
};

export type LoyaltyProgramRow = Tables<"brand_loyalty_programs">;
export type LoyaltyTierRow = Tables<"brand_loyalty_tiers">;
export type LoyaltyAccountRow = Tables<"loyalty_accounts">;
export type LoyaltyLedgerRow = Tables<"loyalty_ledger">;

// ── Reads ───────────────────────────────────────────────────────────────────

/** The brand's program settings, or null when it has none yet. */
export async function fetchLoyaltyProgram(brandId: string): Promise<LoyaltyProgramRow | null> {
  const { data, error } = await supabase
    .from("brand_loyalty_programs")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The brand's tiers, lowest spend first. */
export async function fetchLoyaltyTiers(brandId: string): Promise<LoyaltyTierRow[]> {
  const { data, error } = await supabase
    .from("brand_loyalty_tiers")
    .select("*")
    .eq("brand_id", brandId)
    .order("min_spend", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** One tier of the brand by its key, or null. */
export async function fetchLoyaltyTier(brandId: string, tierKey: string) {
  const { data, error } = await supabase
    .from("brand_loyalty_tiers")
    .select("*")
    .eq("brand_id", brandId)
    .eq("tier_key", tierKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** One customer's points account in the brand, or null. */
export async function fetchLoyaltyAccount(
  brandId: string,
  customerId: string,
): Promise<LoyaltyAccountRow | null> {
  const { data, error } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The brand's latest 200 ledger entries with the customer's contact, newest first. */
export async function fetchLoyaltyLedger(brandId: string) {
  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("*, customers(name, email, phone)")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/** One customer's latest 50 ledger entries, newest first. */
export async function fetchCustomerLoyaltyLedger(
  brandId: string,
  customerId: string,
): Promise<LoyaltyLedgerRow[]> {
  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("*")
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

/** Points outstanding and redeemed across the brand's accounts, and how many accounts. */
export async function fetchLoyaltySummary(brandId: string) {
  const { data, error } = await supabase
    .from("loyalty_accounts")
    .select("active_points, lifetime_spent_points")
    .eq("brand_id", brandId);
  if (error) throw error;
  const rows = data ?? [];
  return {
    totalActive: rows.reduce((acc, row) => acc + (row.active_points || 0), 0),
    totalRedeemed: rows.reduce((acc, row) => acc + (row.lifetime_spent_points || 0), 0),
    customerCount: rows.length,
  };
}

export const loyaltyQueries = {
  program: (brandId: string) =>
    queryOptions({
      queryKey: loyaltyKeys.program(brandId),
      queryFn: () => fetchLoyaltyProgram(brandId),
      enabled: Boolean(brandId),
    }),
  tiers: (brandId: string) =>
    queryOptions({
      queryKey: loyaltyKeys.tiers(brandId),
      queryFn: () => fetchLoyaltyTiers(brandId),
      enabled: Boolean(brandId),
    }),
  ledger: (brandId: string) =>
    queryOptions({
      queryKey: loyaltyKeys.ledger(brandId),
      queryFn: () => fetchLoyaltyLedger(brandId),
      enabled: Boolean(brandId),
    }),
  summary: (brandId: string) =>
    queryOptions({
      queryKey: loyaltyKeys.summary(brandId),
      queryFn: () => fetchLoyaltySummary(brandId),
      enabled: Boolean(brandId),
    }),
  account: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: loyaltyKeys.account(brandId, customerId),
      queryFn: () => fetchLoyaltyAccount(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
  customerLedger: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: loyaltyKeys.customerLedger(brandId, customerId),
      queryFn: () => fetchCustomerLoyaltyLedger(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export type LoyaltyProgramPatch = Omit<TablesInsert<"brand_loyalty_programs">, "brand_id">;
export type LoyaltyTierValues = Omit<TablesInsert<"brand_loyalty_tiers">, "brand_id">;

/** Everything cached about the brand's loyalty program is stale after a write. */
export function invalidateLoyalty(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: loyaltyKeys.all(brandId) });
}

/** Saves the program settings, creating them when the brand has none (upsert on brand). */
export async function saveLoyaltyProgram(brandId: string, values: LoyaltyProgramPatch) {
  const { error } = await supabase
    .from("brand_loyalty_programs")
    .upsert(
      { ...values, brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: "brand_id" },
    );
  if (error) throw error;
}

/** Saves tiers by key, creating the missing ones (upsert on brand and tier key). */
export async function saveLoyaltyTiers(brandId: string, tiers: LoyaltyTierValues[]) {
  const { error } = await supabase.from("brand_loyalty_tiers").upsert(
    tiers.map((tier) => ({ ...tier, brand_id: brandId })),
    { onConflict: "brand_id,tier_key" },
  );
  if (error) throw error;
}

/**
 * Adds or removes points by hand through the ledger function, which records
 * who did it, when and why (Arabic and English reasons).
 */
export async function adjustLoyaltyPoints(args: {
  brandId: string;
  customerId: string;
  pointsDelta: number;
  reasonAr: string;
  reasonEn: string;
}) {
  const { data, error } = await supabase.rpc("rpc_manual_adjust_loyalty_points", {
    p_brand_id: args.brandId,
    p_customer_id: args.customerId,
    p_points_delta: args.pointsDelta,
    p_reason_ar: args.reasonAr,
    p_reason_en: args.reasonEn,
  });
  if (error) throw error;
  return data;
}
