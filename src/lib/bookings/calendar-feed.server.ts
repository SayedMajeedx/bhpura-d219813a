import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { bookingsIcs, type FeedBooking } from "@/lib/bookings/ics";

/**
 * A store's calendar feed for its private link (server only, service-role
 * client): the .ics text, or null when no store has this token.
 */
export async function calendarFeedFor(
  admin: SupabaseClient<Database>,
  token: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("booking_calendar_feed", { p_token: token });
  if (error) throw new Error(`BOOKING_CALENDAR_FEED_FAILED: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const feed = data as { brand_name_en?: string; brand_name_ar?: string; bookings?: FeedBooking[] };
  const name = feed.brand_name_en || feed.brand_name_ar || "Bookings";
  return bookingsIcs({ calendarName: `${name} · Bookings`, bookings: feed.bookings ?? [] });
}
