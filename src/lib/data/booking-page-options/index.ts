import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PACKAGE_STYLE,
  packageStyleFrom,
  type PackageStyle,
} from "@/lib/bookings/package-style";

/**
 * How a services store's booking page looks (booking_page_options; migration
 * 20261002170000): anyone may read it (the booking page needs it), only people
 * who manage the store's settings write it. One row per store.
 */

export type BookingPageOptions = { package_style: PackageStyle };

export const bookingPageOptionsKeys = {
  all: (brandId: string) => ["booking-page-options", brandId] as const,
};

/** The store's options; a store that set none gets the defaults. */
export async function fetchBookingPageOptions(brandId: string): Promise<BookingPageOptions> {
  const { data, error } = await supabase
    .from("booking_page_options")
    .select("package_style")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return { package_style: data ? packageStyleFrom(data.package_style) : DEFAULT_PACKAGE_STYLE };
}

export const bookingPageOptionsQueries = {
  options: (brandId: string) =>
    queryOptions({
      queryKey: bookingPageOptionsKeys.all(brandId),
      queryFn: () => fetchBookingPageOptions(brandId),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
};

export function invalidateBookingPageOptions(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: bookingPageOptionsKeys.all(brandId) });
}

/** Saves the store's options (creates the row the first time). */
export async function saveBookingPageOptions(brandId: string, options: BookingPageOptions) {
  const { error } = await supabase
    .from("booking_page_options")
    .upsert(
      { ...options, brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: "brand_id" },
    );
  if (error) throw error;
}
