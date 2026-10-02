import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookingPolicy } from "@/lib/bookings/policies";

/**
 * A store's booking policies (booking_policies; migration 20261002160000):
 * anyone may read them (the booking page and confirmation show them), only
 * people who manage the store's settings write them. One row per store.
 */

export const bookingPoliciesKeys = {
  all: (brandId: string) => ["booking-policies", brandId] as const,
};

const COLUMNS =
  "balance_due_days, reschedule_months, deposit_refundable, terms_en, terms_ar" as const;

/** The store's policy, or null when it has set none. */
export async function fetchBookingPolicy(brandId: string): Promise<BookingPolicy | null> {
  const { data, error } = await supabase
    .from("booking_policies")
    .select(COLUMNS)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const bookingPoliciesQueries = {
  policy: (brandId: string) =>
    queryOptions({
      queryKey: bookingPoliciesKeys.all(brandId),
      queryFn: () => fetchBookingPolicy(brandId),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
};

export function invalidateBookingPolicies(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: bookingPoliciesKeys.all(brandId) });
}

/** Saves the store's policy (creates the row the first time). */
export async function saveBookingPolicy(brandId: string, policy: BookingPolicy) {
  const { error } = await supabase
    .from("booking_policies")
    .upsert(
      { ...policy, brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: "brand_id" },
    );
  if (error) throw error;
}
