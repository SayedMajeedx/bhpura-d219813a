import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  optionColumns,
  type OptionForm,
  type OptionMode,
  type OptionTiers,
  type ServiceOption,
} from "@/lib/bookings/service-options";

/**
 * A store's service add-ons (service_options): the merchant edits them with a
 * service, and the storefront reads the active ones of the services it shows
 * (anyone may read an active add-on of an active service). Add-ons a merchant
 * removes are switched off, not deleted, so past bookings keep their lines.
 */

export const serviceOptionsKeys = {
  all: (brandId: string) => ["service-options", brandId] as const,
  list: (brandId: string) => [...serviceOptionsKeys.all(brandId), "list"] as const,
};

const COLUMNS =
  "id, product_id, name_en, name_ar, description_en, description_ar, mode, price, tiers, max_quantity, sort_order, is_active" as const;

const asTiers = (value: Json | null): OptionTiers | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { step, prices } = value as { step?: unknown; prices?: unknown };
  if (typeof step !== "number" || !Array.isArray(prices)) return null;
  return { step, prices: prices.map(Number) };
};

/** Every add-on of the store (the public sees the active ones). */
export async function fetchServiceOptions(brandId: string): Promise<ServiceOption[]> {
  const { data, error } = await supabase
    .from("service_options")
    .select(COLUMNS)
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    mode: row.mode as OptionMode,
    price: Number(row.price),
    tiers: asTiers(row.tiers),
  }));
}

export const serviceOptionsQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: serviceOptionsKeys.list(brandId),
      queryFn: () => fetchServiceOptions(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
};

export function invalidateServiceOptions(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: serviceOptionsKeys.all(brandId) });
}

/** The add-ons of one service, from the store's list. */
export function optionsOf(all: readonly ServiceOption[] | undefined, productId: string) {
  return (all ?? []).filter((option) => option.product_id === productId);
}

/**
 * Saves a service's add-ons as the editor shows them: new ones are added,
 * changed ones updated, and ones left out switched off.
 */
export async function saveServiceOptions(
  brandId: string,
  productId: string,
  forms: readonly OptionForm[],
  existingIds: readonly string[],
) {
  const kept = new Set(forms.map((form) => form.id).filter(Boolean));
  const removed = existingIds.filter((id) => !kept.has(id));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("service_options")
      .update({ is_active: false })
      .eq("brand_id", brandId)
      .in("id", removed);
    if (error) throw error;
  }
  for (const [index, form] of forms.entries()) {
    const columns = { ...optionColumns(form), sort_order: index };
    const row = { ...columns, tiers: columns.tiers as unknown as Json };
    const query = form.id
      ? supabase.from("service_options").update(row).eq("id", form.id).eq("brand_id", brandId)
      : supabase
          .from("service_options")
          .insert({ ...row, brand_id: brandId, product_id: productId });
    const { error } = await query;
    if (error) throw error;
  }
}

/** A service's extra-hour price (null: it cannot be booked longer than its longest length). */
export async function saveExtraHourPrice(brandId: string, productId: string, price: number | null) {
  const { error } = await supabase
    .from("products")
    .update({ extra_hour_price: price })
    .eq("brand_id", brandId)
    .eq("id", productId);
  if (error) throw error;
}
