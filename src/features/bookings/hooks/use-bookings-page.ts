import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { invalidateOrders } from "@/lib/data/orders/mutations";
import {
  addBookingBlock,
  bookingsQueries,
  createBookingOrder,
  invalidateBookings,
  removeBookingBlock,
  setBookingDiscount,
  setBookingStatus,
  type Booking,
} from "@/lib/data/bookings";
import { bookingErrorMessage } from "@/lib/bookings/errors";
import { DEFAULT_BOOKING_RULES, todayIn, type BookingStatus } from "@/lib/bookings/rules";
import { summariseMonth } from "@/features/bookings/lib/calendar-view";
import { bookingInvoiceOf } from "@/features/bookings/lib/booking-invoice";
import { gridRange, shiftMonth } from "@/lib/bookings/format";

/** Weeks start on Sunday, as GCC booking calendars usually do. */
export const WEEK_STARTS_ON = 0;

/**
 * The bookings page's state: the month on screen, the chosen day, the
 * store's rules, bookings, blocks and waiting requests, and the actions staff
 * take on them. Every write goes through the bookings data layer; the
 * database decides whether a day still has a place.
 */
export function useBookingsPage() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const settingsQuery = useQuery(bookingsQueries.settings(brand.id));
  const rules = settingsQuery.data ?? DEFAULT_BOOKING_RULES;
  const configured = settingsQuery.data != null;
  const today = todayIn(rules.timezone);
  const currency = useQuery(businessSettingsQueries.detail(brand.id)).data?.currency ?? "BHD";

  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [selectedDay, setSelectedDay] = useState(today);
  const { from, to } = gridRange(cursor.year, cursor.month, WEEK_STARTS_ON);

  const rangeQuery = useQuery(bookingsQueries.range(brand.id, from, to));
  const blocksQuery = useQuery(bookingsQueries.blocks(brand.id, from, to));
  const requestsQuery = useQuery(bookingsQueries.requests(brand.id));
  const areaFeesQuery = useQuery(bookingsQueries.areaFees(brand.id));
  const bookings = useMemo(() => rangeQuery.data ?? [], [rangeQuery.data]);
  const blocks = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);

  const weeks = useMemo(
    () =>
      summariseMonth({
        year: cursor.year,
        month: cursor.month,
        weekStartsOn: WEEK_STARTS_ON,
        rules,
        bookings,
        blocks,
        today,
      }),
    [cursor, rules, bookings, blocks, today],
  );
  const selectedCell = weeks.flat().find((cell) => cell.day === selectedDay) ?? null;
  const dayBookings = bookings.filter((booking) => booking.event_date === selectedDay);
  const dayBlocks = blocks.filter(
    (block) => selectedDay >= block.starts_on && selectedDay <= block.ends_on,
  );

  const refresh = () => invalidateBookings(qc, brand.id);
  const onError = (error: Error) => toast.error(bookingErrorMessage(error.message, isAr));

  const statusMutation = useMutation({
    mutationFn: ({
      booking,
      status,
      reason,
    }: {
      booking: Booking;
      status: BookingStatus;
      reason?: string;
    }) => setBookingStatus(booking.id, status, reason),
    onSuccess: async () => {
      await refresh();
      toast.success(isAr ? "تم تحديث الحجز" : "Booking updated");
    },
    onError,
  });

  // A booking's invoice is its order: made on demand, or with the booking.
  const invoiceMutation = useMutation({
    mutationFn: (booking: Booking) => createBookingOrder(booking.id),
    onSuccess: async () => {
      await Promise.all([refresh(), invalidateOrders(qc, brand.id)]);
      toast.success(isAr ? "تم إنشاء الفاتورة" : "Invoice created");
    },
    onError,
  });

  const discountMutation = useMutation({
    mutationFn: ({
      booking,
      amount,
      label,
    }: {
      booking: Booking;
      amount: number;
      label?: string;
    }) => setBookingDiscount(booking.id, amount, label),
    onSuccess: async () => {
      await Promise.all([refresh(), invalidateOrders(qc, brand.id)]);
      toast.success(isAr ? "تم تحديث الخصم" : "Discount updated");
    },
    onError,
  });

  const blockMutation = useMutation({
    mutationFn: (input: { starts_on: string; ends_on: string; reason?: string }) =>
      addBookingBlock(brand.id, input),
    onSuccess: async () => {
      await refresh();
      toast.success(isAr ? "تم إغلاق الأيام للحجز" : "Days blocked");
    },
    onError,
  });

  const unblockMutation = useMutation({
    mutationFn: (blockId: string) => removeBookingBlock(brand.id, blockId),
    onSuccess: async () => {
      await refresh();
      toast.success(isAr ? "تم فتح الأيام للحجز" : "Days reopened");
    },
    onError,
  });

  /** Shows a day (from the requests list, say), moving the calendar to its month. */
  const goToDay = (day: string) => {
    setCursor({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });
    setSelectedDay(day);
  };

  return {
    brand,
    isAr,
    currency,
    rules,
    configured,
    settingsLoading: settingsQuery.isLoading,
    today,
    cursor,
    previousMonth: () => setCursor((current) => shiftMonth(current, -1)),
    nextMonth: () => setCursor((current) => shiftMonth(current, 1)),
    thisMonth: () => goToDay(today),
    weeks,
    loading: rangeQuery.isLoading || blocksQuery.isLoading,
    selectedDay,
    selectDay: setSelectedDay,
    goToDay,
    selectedCell,
    dayBookings,
    dayBlocks,
    requests: (requestsQuery.data ?? []).filter((booking) => booking.status === "requested"),
    /** A day held for a BenefitPay transfer whose receipt waits for the store's check. */
    toVerify: (requestsQuery.data ?? []).filter(
      (booking) =>
        booking.status === "hold" && bookingInvoiceOf(booking)?.status === "pending_verification",
    ),
    /** The store's travel fees by area code. */
    areaFees: areaFeesQuery.data ?? {},
    setStatus: statusMutation.mutate,
    statusPending: statusMutation.isPending,
    createInvoice: invoiceMutation.mutate,
    invoicePending: invoiceMutation.isPending,
    setDiscount: discountMutation.mutate,
    discountPending: discountMutation.isPending,
    blockDays: blockMutation.mutate,
    blockPending: blockMutation.isPending,
    unblock: unblockMutation.mutate,
    unblockPending: unblockMutation.isPending,
    refresh,
  };
}

export type BookingsPage = ReturnType<typeof useBookingsPage>;
