import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { readAll } from "../read-all";
import { movedOrderNotes } from "@/lib/bookings/move";

/**
 * What staff do with a booking day to day, beyond its status: the reminder the
 * day before (a WhatsApp message a person sends; the store's record of it is
 * the activity log, `booking_reminder`, so a booking is not reminded twice) and
 * the order's line for a booking that moved to another date.
 */

export const BOOKING_REMINDER_ACTION = "booking_reminder";

/** How far back the record of reminders is read: a reminder is for the day before. */
const REMINDER_DAYS = 14;

export const bookingOperationsKeys = {
  reminders: (brandId: string) => ["bookings", brandId, "reminders"] as const,
};

/** The bookings reminded in the last two weeks, with when (the latest reminder of each). */
export async function fetchBookingReminders(brandId: string): Promise<Map<string, string>> {
  const since = new Date(Date.now() - REMINDER_DAYS * 86_400_000).toISOString();
  const rows = await readAll((from, to) =>
    supabase
      .from("activity_logs")
      .select("id, created_at, metadata", { count: "exact" })
      .eq("brand_id", brandId)
      .eq("action", BOOKING_REMINDER_ACTION)
      .gte("created_at", since)
      .order("id")
      .range(from, to),
  );
  const reminded = new Map<string, string>();
  for (const row of rows) {
    const bookingId = (row.metadata as { booking_id?: unknown } | null)?.booking_id;
    if (typeof bookingId !== "string") continue;
    const seen = reminded.get(bookingId);
    if (!seen || row.created_at > seen) reminded.set(bookingId, row.created_at);
  }
  return reminded;
}

export const bookingOperationsQueries = {
  reminders: (brandId: string) =>
    queryOptions({
      queryKey: bookingOperationsKeys.reminders(brandId),
      queryFn: () => fetchBookingReminders(brandId),
      enabled: Boolean(brandId),
    }),
};

/**
 * Keeps a reminder sent. A failure is thrown: this record is what keeps the
 * booking from being offered again.
 */
export async function recordBookingReminder(
  brandId: string,
  booking: { id: string; reference: string; order_id?: string | null },
) {
  const { error } = await supabase.from("activity_logs").insert({
    brand_id: brandId,
    action: BOOKING_REMINDER_ACTION,
    order_id: booking.order_id ?? null,
    message_ar: `تذكير بالحجز ${booking.reference}`,
    message_en: `Booking ${booking.reference} reminded`,
    metadata: { booking_id: booking.id, reference: booking.reference } as Json,
  });
  if (error) throw error;
}

/**
 * Moves the booking's line in its order's notes to the new day and time (the
 * invoice prints the notes). Nothing is written when the notes carry no line
 * for it. Returns whether the notes changed.
 */
export async function moveBookingOrderNote(
  brandId: string,
  orderId: string,
  reference: string,
  line: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .select("notes")
    .eq("id", orderId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  const notes = movedOrderNotes(data?.notes, reference, line);
  if (notes === null) return false;
  const { error: writeError } = await supabase
    .from("orders")
    .update({ notes })
    .eq("id", orderId)
    .eq("brand_id", brandId);
  if (writeError) throw writeError;
  return true;
}
