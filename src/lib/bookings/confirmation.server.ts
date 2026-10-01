import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { confirmationFromRow, type BookingConfirmation } from "@/lib/bookings/confirmation";

/**
 * The appointment an order was placed for, for the card gateway's redirect to
 * the thank-you page (server only, with the service-role client). Null when
 * the order has no booking or anything about the lookup fails: the payment is
 * already settled, so the shopper must still reach the page, just without the
 * appointment. It never throws.
 */
export async function orderBookingConfirmation(
  admin: SupabaseClient<Database>,
  orderId: string,
  brandId: string,
): Promise<BookingConfirmation | null> {
  try {
    const { data: booking, error } = await admin
      .from("bookings")
      .select("reference, event_date, starts_at, ends_at")
      .eq("order_id", orderId)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (error || !booking) return null;
    const { data: settings } = await admin
      .from("booking_settings")
      .select("timezone")
      .eq("brand_id", brandId)
      .maybeSingle();
    return confirmationFromRow(booking, settings?.timezone ?? "Asia/Bahrain");
  } catch (error) {
    console.warn("[thank-you] the order's appointment could not be read", error);
    return null;
  }
}
