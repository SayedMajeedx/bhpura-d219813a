import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiscountRule } from "@/lib/bookings/discounts";
import type { discountFormColumns } from "@/lib/bookings/discounts";

/**
 * A services store's booking-time discount rules: the merchant's list and
 * writes (manage_settings), and the active ones a storefront shows
 * (get_booking_discounts). The database applies the best one when a booking
 * is made; see supabase/migrations/20261002100000_booking_discounts.sql.
 */

export const bookingDiscountsKeys = {
  all: (brandId: string) => ["booking-discounts", brandId] as const,
  list: (brandId: string) => [...bookingDiscountsKeys.all(brandId), "list"] as const,
  public: (brandId: string) => [...bookingDiscountsKeys.all(brandId), "public"] as const,
};

const RULE_COLUMNS =
  "id, name_en, name_ar, kind, value, min_days, max_days, weekdays, product_ids, valid_from, valid_to, is_active, created_at" as const;

export type DiscountRuleRow = DiscountRule & { is_active: boolean; created_at: string };

const asRule = (row: {
  kind: string;
  value: number | string;
  weekdays: number[] | null;
}): Pick<DiscountRule, "kind" | "value" | "weekdays"> => ({
  kind: row.kind === "fixed" ? "fixed" : "percent",
  value: Number(row.value),
  weekdays: row.weekdays ?? null,
});

/** The store's rules, switched off ones too, earliest window first. */
export async function fetchDiscountRules(brandId: string): Promise<DiscountRuleRow[]> {
  const { data, error } = await supabase
    .from("booking_discount_rules")
    .select(RULE_COLUMNS)
    .eq("brand_id", brandId)
    .order("min_days", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, ...asRule(row) }));
}

/** What a storefront may show: the active rules of a store that takes bookings. */
export async function fetchPublicDiscounts(brandId: string): Promise<DiscountRule[]> {
  const { data, error } = await supabase.rpc("get_booking_discounts", { p_brand_id: brandId });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, ...asRule(row) }));
}

export const bookingDiscountsQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: bookingDiscountsKeys.list(brandId),
      queryFn: () => fetchDiscountRules(brandId),
      enabled: Boolean(brandId),
    }),
  public: (brandId: string) =>
    queryOptions({
      queryKey: bookingDiscountsKeys.public(brandId),
      queryFn: () => fetchPublicDiscounts(brandId),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export function invalidateBookingDiscounts(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: bookingDiscountsKeys.all(brandId) });
}

type RuleColumns = ReturnType<typeof discountFormColumns>;

/** Creates a rule (no id) or changes one. */
export async function saveDiscountRule(brandId: string, id: string | null, columns: RuleColumns) {
  const query = id
    ? supabase
        .from("booking_discount_rules")
        .update({ ...columns, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("brand_id", brandId)
    : supabase.from("booking_discount_rules").insert({ ...columns, brand_id: brandId });
  const { error } = await query;
  if (error) throw error;
}

export async function setDiscountRuleActive(brandId: string, id: string, isActive: boolean) {
  const { error } = await supabase
    .from("booking_discount_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deleteDiscountRule(brandId: string, id: string) {
  const { error } = await supabase
    .from("booking_discount_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) throw error;
}
