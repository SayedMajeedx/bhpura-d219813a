import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  toBookingRules,
  type BookingRules,
  type BookingStatus,
  type PublicBookingRules,
} from "@/lib/bookings/rules";
import type { BookingHold } from "@/lib/bookings/cart";
import type {
  ServiceDayRow,
  StartRow,
} from "@/features/storefront-booking/lib/service-availability";

/**
 * A services store's bookings: its rules, its bookings and their services,
 * the days it blocks, and, for the storefront, each day's availability.
 * Staff read their store's rows (can_access_brand); bookings are written only
 * through the database functions, which hold the day's last place for one
 * booking at a time. See supabase/migrations/20260930100000_bookings_engine.sql.
 */

const BOOKING_COLUMNS =
  "id, reference, status, event_date, starts_at, ends_at, customer_id, customer_name, customer_phone, customer_email, location, notes, source, order_id, hold_expires_at, total, travel_fee, deposit_amount, discount_amount, discount_label_en, discount_label_ar, confirmed_at, cancelled_at, cancel_reason, created_at, booking_items(id, product_id, variant_id, name_en, name_ar, quantity, unit_price, line_total, parent_item_id), orders(id, invoice_number, public_invoice_token, status, payment_status, total, advance_paid, currency)" as const;

const BLOCK_COLUMNS = "id, starts_on, ends_on, reason, created_at" as const;

export const bookingsKeys = {
  all: (brandId: string) => ["bookings", brandId] as const,
  settings: (brandId: string) => [...bookingsKeys.all(brandId), "settings"] as const,
  range: (brandId: string, from: string, to: string) =>
    [...bookingsKeys.all(brandId), "range", from, to] as const,
  blocks: (brandId: string, from: string, to: string) =>
    [...bookingsKeys.all(brandId), "blocks", from, to] as const,
  requests: (brandId: string) => [...bookingsKeys.all(brandId), "requests"] as const,
  availability: (brandId: string, from: string, to: string) =>
    [...bookingsKeys.all(brandId), "availability", from, to] as const,
  publicRules: (brandId: string) => [...bookingsKeys.all(brandId), "public-rules"] as const,
  serviceDays: (
    brandId: string,
    productIds: readonly string[],
    from: string,
    to: string,
    minutes: number | null,
  ) =>
    [
      ...bookingsKeys.all(brandId),
      "service-days",
      [...productIds].sort(),
      from,
      to,
      minutes,
    ] as const,
  serviceStarts: (brandId: string, productIds: readonly string[], day: string, minutes: number) =>
    [...bookingsKeys.all(brandId), "service-starts", [...productIds].sort(), day, minutes] as const,
  areaFees: (brandId: string) => [...bookingsKeys.all(brandId), "area-fees"] as const,
  calendarToken: (brandId: string) => [...bookingsKeys.all(brandId), "calendar-token"] as const,
  forOrder: (brandId: string, orderId: string) =>
    [...bookingsKeys.all(brandId), "order", orderId] as const,
};

/** The store's booking rules, or null when it has not set bookings up. */
export async function fetchBookingSettings(brandId: string): Promise<BookingRules | null> {
  const { data, error } = await supabase
    .from("booking_settings")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data ? toBookingRules(data) : null;
}

/** Bookings from `from` to `to` (ISO days, inclusive), earliest first. */
export async function fetchBookingsInRange(brandId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("brand_id", brandId)
    .gte("event_date", from)
    .lte("event_date", to)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type Booking = Awaited<ReturnType<typeof fetchBookingsInRange>>[number];

/** The booking an order was placed for (a services store's checkout), or null. */
export async function fetchBookingForOrder(brandId: string, orderId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("brand_id", brandId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Booking requests waiting for the store, soonest day first. */
export async function fetchBookingRequests(brandId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("brand_id", brandId)
    .in("status", ["requested", "hold"])
    .order("event_date", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/** Blocks that touch the days from `from` to `to`. */
export async function fetchBookingBlocks(brandId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from("booking_blocks")
    .select(BLOCK_COLUMNS)
    .eq("brand_id", brandId)
    .lte("starts_on", to)
    .gte("ends_on", from)
    .order("starts_on", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type BookingBlockRow = Awaited<ReturnType<typeof fetchBookingBlocks>>[number];

/** Each day's state for customers (anyone may ask; no customer data). */
export async function fetchBookingAvailability(brandId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc("get_booking_availability", {
    p_brand_id: brandId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

/** Each day's state for the chosen services, each with its own capacity and notice. */
export async function fetchServiceAvailability(
  brandId: string,
  productIds: readonly string[],
  from: string,
  to: string,
  minutes: number | null,
): Promise<ServiceDayRow[]> {
  const { data, error } = await supabase.rpc("get_service_availability", {
    p_brand_id: brandId,
    p_product_ids: [...productIds],
    p_from: from,
    p_to: to,
    ...(minutes ? { p_duration_minutes: minutes } : {}),
  });
  if (error) throw error;
  return data ?? [];
}

/** The start times ("HH:MM") of one day, free or not, for a booking of the chosen services. */
export async function fetchServiceFreeStarts(
  brandId: string,
  productIds: readonly string[],
  day: string,
  minutes: number,
): Promise<StartRow[]> {
  const { data, error } = await supabase.rpc("get_service_free_starts", {
    p_brand_id: brandId,
    p_product_ids: [...productIds],
    p_day: day,
    p_duration_minutes: minutes,
  });
  if (error) throw error;
  // The database answers with a time ("10:00:00"); the flow keeps "HH:MM".
  return (data ?? []).map((row) => ({ ...row, start_time: row.start_time.slice(0, 5) }));
}

/** The rules a storefront needs, or null when the store takes no bookings. */
export async function fetchPublicBookingRules(brandId: string): Promise<PublicBookingRules | null> {
  const { data, error } = await supabase.rpc("get_public_booking_rules", { p_brand_id: brandId });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const fees = row.travel_fees && typeof row.travel_fees === "object" ? row.travel_fees : {};
  return {
    ...toBookingRules(row),
    travel_fees: Object.fromEntries(
      Object.entries(fees as Record<string, unknown>)
        .map(([code, fee]) => [code, Number(fee)] as const)
        .filter(([, fee]) => Number.isFinite(fee)),
    ),
  };
}

/** The secret of the store's private calendar link, or null when it has none. */
export async function fetchCalendarToken(brandId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("booking_settings")
    .select("calendar_token")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data?.calendar_token ?? null;
}

/** The store's travel fees by area code (admin). */
export async function fetchBookingAreaFees(brandId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("booking_area_fees")
    .select("area_code, fee")
    .eq("brand_id", brandId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.area_code, Number(row.fee)]));
}

export const bookingsQueries = {
  settings: (brandId: string) =>
    queryOptions({
      queryKey: bookingsKeys.settings(brandId),
      queryFn: () => fetchBookingSettings(brandId),
      enabled: Boolean(brandId),
    }),
  range: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: bookingsKeys.range(brandId, from, to),
      queryFn: () => fetchBookingsInRange(brandId, from, to),
      enabled: Boolean(brandId),
    }),
  requests: (brandId: string) =>
    queryOptions({
      queryKey: bookingsKeys.requests(brandId),
      queryFn: () => fetchBookingRequests(brandId),
      enabled: Boolean(brandId),
    }),
  blocks: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: bookingsKeys.blocks(brandId, from, to),
      queryFn: () => fetchBookingBlocks(brandId, from, to),
      enabled: Boolean(brandId),
    }),
  availability: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: bookingsKeys.availability(brandId, from, to),
      queryFn: () => fetchBookingAvailability(brandId, from, to),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
  calendarToken: (brandId: string) =>
    queryOptions({
      queryKey: bookingsKeys.calendarToken(brandId),
      queryFn: () => fetchCalendarToken(brandId),
      enabled: Boolean(brandId),
    }),
  areaFees: (brandId: string) =>
    queryOptions({
      queryKey: bookingsKeys.areaFees(brandId),
      queryFn: () => fetchBookingAreaFees(brandId),
      enabled: Boolean(brandId),
    }),
  forOrder: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: bookingsKeys.forOrder(brandId, orderId),
      queryFn: () => fetchBookingForOrder(brandId, orderId),
      enabled: Boolean(brandId && orderId),
    }),
  serviceDays: (
    brandId: string,
    productIds: readonly string[],
    from: string,
    to: string,
    minutes: number | null,
  ) =>
    queryOptions({
      queryKey: bookingsKeys.serviceDays(brandId, productIds, from, to, minutes),
      queryFn: () => fetchServiceAvailability(brandId, productIds, from, to, minutes),
      enabled: Boolean(brandId) && productIds.length > 0,
      staleTime: 30_000,
    }),
  serviceStarts: (brandId: string, productIds: readonly string[], day: string, minutes: number) =>
    queryOptions({
      queryKey: bookingsKeys.serviceStarts(brandId, productIds, day, minutes),
      queryFn: () => fetchServiceFreeStarts(brandId, productIds, day, minutes),
      enabled: Boolean(brandId) && productIds.length > 0 && Boolean(day) && minutes > 0,
      staleTime: 15_000,
    }),
  publicRules: (brandId: string) =>
    queryOptions({
      queryKey: bookingsKeys.publicRules(brandId),
      queryFn: () => fetchPublicBookingRules(brandId),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export function invalidateBookings(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: bookingsKeys.all(brandId) });
}

/** Saves the store's booking rules (creating them the first time). */
export async function saveBookingSettings(brandId: string, rules: BookingRules) {
  // The table's columns only (the rules a storefront reads carry more).
  const row = {
    brand_id: brandId,
    timezone: rules.timezone,
    daily_capacity: rules.daily_capacity,
    open_time: rules.open_time,
    last_start_time: rules.last_start_time,
    slot_minutes: rules.slot_minutes,
    min_duration_minutes: rules.min_duration_minutes,
    max_duration_minutes: rules.max_duration_minutes,
    duration_step_minutes: rules.duration_step_minutes,
    lead_days: rules.lead_days,
    horizon_days: rules.horizon_days,
    hold_minutes: rules.hold_minutes,
    closed_weekdays: rules.closed_weekdays,
    deposit_percent: rules.deposit_percent,
    travel_fee_default: rules.travel_fee_default,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("booking_settings").upsert(row);
  if (error) throw error;
}

/**
 * Makes a new private calendar link (a fresh random secret, so any old link
 * stops working), or removes it (null).
 */
export async function setCalendarToken(brandId: string, token: string | null) {
  const { error } = await supabase
    .from("booking_settings")
    .update({ calendar_token: token })
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Saves the store's travel fees by area: set ones are kept, cleared (null) ones removed. */
export async function saveBookingAreaFees(brandId: string, fees: Record<string, number | null>) {
  const set = Object.entries(fees).filter(
    (entry): entry is [string, number] => entry[1] !== null && Number.isFinite(entry[1]),
  );
  const cleared = Object.entries(fees)
    .filter(([, fee]) => fee === null)
    .map(([code]) => code);
  if (set.length > 0) {
    const { error } = await supabase.from("booking_area_fees").upsert(
      set.map(([area_code, fee]) => ({
        brand_id: brandId,
        area_code,
        fee,
        updated_at: new Date().toISOString(),
      })),
    );
    if (error) throw error;
  }
  if (cleared.length > 0) {
    const { error } = await supabase
      .from("booking_area_fees")
      .delete()
      .eq("brand_id", brandId)
      .in("area_code", cleared);
    if (error) throw error;
  }
}

export async function addBookingBlock(
  brandId: string,
  block: { starts_on: string; ends_on: string; reason?: string | null },
) {
  const { error } = await supabase.from("booking_blocks").insert({
    brand_id: brandId,
    starts_on: block.starts_on,
    ends_on: block.ends_on,
    reason: block.reason?.trim() || null,
  });
  if (error) throw error;
}

export async function removeBookingBlock(brandId: string, blockId: string) {
  const { error } = await supabase
    .from("booking_blocks")
    .delete()
    .eq("id", blockId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export type StaffBookingInput = {
  brandId: string;
  day: string;
  start: string;
  durationMinutes: number;
  customer: { id?: string | null; name?: string; phone?: string; email?: string };
  items: Array<{
    product_id?: string | null;
    variant_id?: string | null;
    name_en?: string | null;
    name_ar?: string | null;
    quantity: number;
    unit_price: number;
  }>;
  location?: Record<string, string>;
  notes?: string;
  status?: "confirmed" | "requested";
  source?: "admin" | "whatsapp";
  allowOverbook?: boolean;
};

/** A booking the store takes itself; refused on a full, closed or blocked day unless overbooked. */
export async function createStaffBooking(input: StaffBookingInput) {
  const { data, error } = await supabase.rpc("create_staff_booking", {
    p_brand_id: input.brandId,
    p_day: input.day,
    p_start: input.start,
    p_duration_minutes: input.durationMinutes,
    p_customer: input.customer as Json,
    p_items: input.items as Json,
    p_location: (input.location ?? {}) as Json,
    p_notes: input.notes || undefined,
    p_status: input.status ?? "confirmed",
    p_source: input.source ?? "admin",
    p_allow_overbook: input.allowOverbook ?? false,
  });
  if (error) throw error;
  return data;
}

export async function setBookingStatus(bookingId: string, status: BookingStatus, reason?: string) {
  const { data, error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: status,
    p_reason: reason || undefined,
  });
  if (error) throw error;
  return data;
}

export async function rescheduleBooking(input: {
  bookingId: string;
  day: string;
  start: string;
  durationMinutes: number;
  allowOverbook?: boolean;
}) {
  const { data, error } = await supabase.rpc("reschedule_booking", {
    p_booking_id: input.bookingId,
    p_day: input.day,
    p_start: input.start,
    p_duration_minutes: input.durationMinutes,
    p_allow_overbook: input.allowOverbook ?? false,
  });
  if (error) throw error;
  return data;
}

export type BookingRequestInput = {
  brandId: string;
  day: string;
  start: string;
  durationMinutes: number;
  items: Array<{ product_id: string; variant_id?: string | null; quantity: number }>;
  customer: { name: string; phone: string; email?: string };
  location?: Record<string, string>;
  notes?: string;
};

export type BookingRequestResult = {
  reference: string;
  status: string;
  event_date: string;
  starts_at: string;
  ends_at: string;
  total: number;
};

/**
 * A customer's booking request from the storefront (anyone may send one; the
 * database prices it and limits how often). It takes no place until the store
 * confirms it.
 */
export async function requestBooking(input: BookingRequestInput): Promise<BookingRequestResult> {
  const { data, error } = await supabase.rpc("request_booking", {
    p_brand_id: input.brandId,
    p_day: input.day,
    p_start: input.start,
    p_duration_minutes: input.durationMinutes,
    p_items: input.items as Json,
    p_customer: input.customer as Json,
    p_location: (input.location ?? {}) as Json,
    p_notes: input.notes || undefined,
  });
  if (error) throw error;
  return data as unknown as BookingRequestResult;
}

/**
 * Holds the day for the customer while they check out (shop stores): the same
 * checks, prices and limits as a request, but it takes the day's place for
 * the store's hold time. Returns the booking, its secret hold token and the
 * booked services as the database priced them.
 */
export async function holdBooking(input: BookingRequestInput): Promise<BookingHold> {
  const { data, error } = await supabase.rpc("hold_booking", {
    p_brand_id: input.brandId,
    p_day: input.day,
    p_start: input.start,
    p_duration_minutes: input.durationMinutes,
    p_items: input.items as Json,
    p_customer: input.customer as Json,
    p_location: (input.location ?? {}) as Json,
    p_notes: input.notes || undefined,
  });
  if (error) throw error;
  return data as unknown as BookingHold;
}

/**
 * Invoices a booking: its appointment order (a request becomes a pending
 * order, a quote). Asking again returns the same order's id.
 */
export async function createBookingOrder(bookingId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_booking_order", { p_booking_id: bookingId });
  if (error) throw error;
  return data;
}

/** Sets a booking's discount by hand (0 clears it); its order follows. */
export async function setBookingDiscount(bookingId: string, amount: number, label?: string) {
  const { data, error } = await supabase.rpc("set_booking_discount", {
    p_booking_id: bookingId,
    p_amount: amount,
    p_label: label ?? undefined,
  });
  if (error) throw error;
  return data;
}
