import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ruleColumns, AdvanceRuleRow } from "@/lib/payments/advance-rule-form";

/**
 * A store's own advance-payment rules (advance_payment_rules; migration 20261003150000):
 * the merchant's list and writes (manage_settings), and the active ones the storefront
 * reads to show what an order will ask. The database decides every order from the rules
 * kept on it when it was placed (migration 20261003160000).
 */

export const advanceRulesKeys = {
  all: (brandId: string) => ["advance-rules", brandId] as const,
  list: (brandId: string) => [...advanceRulesKeys.all(brandId), "list"] as const,
  public: (brandId: string) => [...advanceRulesKeys.all(brandId), "public"] as const,
};

const COLUMNS =
  "id, name_en, name_ar, is_active, sort_order, fulfillment, made_to_order, product_ids, category_slugs, amount_kind, amount_value, min_amount, max_amount, include_delivery_fee" as const;

/** The store's rules in the order they are tried, switched-off ones too. */
export async function fetchAdvanceRules(brandId: string): Promise<AdvanceRuleRow[]> {
  const { data, error } = await supabase
    .from("advance_payment_rules")
    .select(COLUMNS)
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** What a storefront may show: the active rules, in order. */
export async function fetchPublicAdvanceRules(brandId: string): Promise<AdvanceRuleRow[]> {
  const { data, error } = await supabase
    .from("advance_payment_rules")
    .select(COLUMNS)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export const advanceRulesQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: advanceRulesKeys.list(brandId),
      queryFn: () => fetchAdvanceRules(brandId),
      enabled: Boolean(brandId),
    }),
  public: (brandId: string, enabled = true) =>
    queryOptions({
      queryKey: advanceRulesKeys.public(brandId),
      queryFn: () => fetchPublicAdvanceRules(brandId),
      enabled: Boolean(brandId) && enabled,
      staleTime: 60_000,
    }),
};

export function invalidateAdvanceRules(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: advanceRulesKeys.all(brandId) });
}

type Columns = ReturnType<typeof ruleColumns>;

/** Adds a rule (no id, after `sortOrder`) or changes one. */
export async function saveAdvanceRule(
  brandId: string,
  id: string | null,
  columns: Columns,
  sortOrder: number,
) {
  const query = id
    ? supabase.from("advance_payment_rules").update(columns).eq("id", id).eq("brand_id", brandId)
    : supabase
        .from("advance_payment_rules")
        .insert({ ...columns, brand_id: brandId, sort_order: sortOrder });
  const { error } = await query;
  if (error) throw error;
}

export async function setAdvanceRuleActive(brandId: string, id: string, isActive: boolean) {
  const { error } = await supabase
    .from("advance_payment_rules")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deleteAdvanceRule(brandId: string, id: string) {
  const { error } = await supabase
    .from("advance_payment_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Writes a new order: one update per rule that moved. */
export async function reorderAdvanceRules(
  brandId: string,
  order: ReadonlyArray<{ id: string; sort_order: number }>,
) {
  const results = await Promise.all(
    order.map(({ id, sort_order }) =>
      supabase
        .from("advance_payment_rules")
        .update({ sort_order })
        .eq("id", id)
        .eq("brand_id", brandId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
