import { useMemo, useState } from "react";
import { catalogQueries } from "@/lib/data/catalog";
import { storeDayLimitApplies } from "@/lib/bookings/service-capacity";
import { waitingOnStore } from "@/features/bookings/lib/waiting-on-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import {
  courierCompleteDelivery,
  invalidateOrders,
  updateOrder,
} from "@/lib/data/orders/mutations";
import { logActivity } from "@/lib/activity-log";
import {
  addBookingBlock,
  bookingOperationsQueries,
  bookingsQueries,
  createBookingOrder,
  invalidateBookings,
  moveBookingOrderNote,
  recordBookingReminder,
  removeBookingBlock,
  rescheduleBooking,
  setBookingDiscount,
  setBookingStatus,
  type Booking,
} from "@/lib/data/bookings";
import { bookingErrorMessage } from "@/lib/bookings/errors";
import {
  bookingEnd,
  DEFAULT_BOOKING_RULES,
  todayIn,
  type BookingStatus,
} from "@/lib/bookings/rules";
import { bookingMinutes, bookingNoteLine } from "@/lib/bookings/move";
import { agendaEnd } from "@/features/bookings/lib/agenda";
import { summariseMonth } from "@/features/bookings/lib/calendar-view";
import { donePlan } from "@/features/bookings/lib/booking-actions";
import { takesDeposits } from "@/lib/bookings/deposit";
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
  const businessSettings = useQuery(businessSettingsQueries.detail(brand.id)).data;
  const currency = businessSettings?.currency ?? "BHD";

  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [selectedDay, setSelectedDay] = useState(today);
  const { from, to } = gridRange(cursor.year, cursor.month, WEEK_STARTS_ON);

  const rangeQuery = useQuery(bookingsQueries.range(brand.id, from, to));
  const blocksQuery = useQuery(bookingsQueries.blocks(brand.id, from, to));
  const requestsQuery = useQuery(bookingsQueries.requests(brand.id));
  const waiting = waitingOnStore(requestsQuery.data ?? []);
  const areaFeesQuery = useQuery(bookingsQueries.areaFees(brand.id));
  const bookings = useMemo(() => rangeQuery.data ?? [], [rangeQuery.data]);
  // The store's day limit decides "full" only for services with no capacity of their own.
  const services = useQuery(catalogQueries.products(brand.id)).data;
  const storeLimit = storeDayLimitApplies(services ?? []);
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
        storeLimit,
      }),
    [cursor, rules, bookings, blocks, today, storeLimit],
  );
  const selectedCell = weeks.flat().find((cell) => cell.day === selectedDay) ?? null;
  const dayBookings = bookings.filter((booking) => booking.event_date === selectedDay);
  const dayBlocks = blocks.filter(
    (block) => selectedDay >= block.starts_on && selectedDay <= block.ends_on,
  );

  // The agenda: today and the next days, apart from the month on screen.
  const agendaQuery = useQuery(bookingsQueries.range(brand.id, today, agendaEnd(today)));
  const remindersQuery = useQuery(bookingOperationsQueries.reminders(brand.id));

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

  // A booking is finished through its order (booking-actions.ts): the order completes, with what
  // the customer still owed recorded as collected, and the booking follows it
  // (sync_bookings_with_order). A booking with no order to complete is marked done alone.
  const doneMutation = useMutation({
    mutationFn: async (booking: Booking) => {
      const plan = donePlan(booking);
      if (plan.kind === "verify_first") {
        throw new Error(
          isAr ? "راجع إيصال التحويل وأكّد الدفع أولاً." : "Approve the transfer receipt first.",
        );
      }
      if (plan.kind === "booking") {
        await setBookingStatus(booking.id, "completed");
        return;
      }
      if (plan.collect > 0) {
        const error = await courierCompleteDelivery(plan.orderId, plan.collect, null);
        if (error) throw error;
      } else {
        const at = new Date().toISOString();
        await updateOrder(brand.id, plan.orderId, {
          fulfillment_status: "COMPLETED",
          status: "completed",
          delivered_at: at,
          updated_at: at,
        });
      }
      await logActivity({
        action: "status_change",
        brand_id: brand.id,
        order_id: plan.orderId,
        en:
          plan.collect > 0
            ? "Collected the balance and completed the service"
            : "Completed the service",
        ar: plan.collect > 0 ? "تحصيل المبلغ المتبقي وإتمام الخدمة" : "تم تنفيذ الخدمة",
      });
    },
    onSuccess: async () => {
      await Promise.all([refresh(), invalidateOrders(qc, brand.id)]);
      toast.success(isAr ? "تم تنفيذ الخدمة وإتمام الطلب" : "Service completed");
    },
    onError,
  });

  // Moving a booking keeps its length (its price was set for it); the database checks the new
  // day has a place unless staff move it anyway. The order's line for the booking moves with it.
  const moveMutation = useMutation({
    mutationFn: async ({
      booking,
      day,
      start,
      allowOverbook,
    }: {
      booking: Booking;
      day: string;
      start: string;
      allowOverbook: boolean;
    }) => {
      const minutes = bookingMinutes(booking);
      await rescheduleBooking({
        bookingId: booking.id,
        day,
        start,
        durationMinutes: minutes,
        allowOverbook,
      });
      if (booking.order_id) {
        const line = bookingNoteLine(
          booking.reference,
          day,
          start,
          bookingEnd(start, minutes).time,
        );
        await moveBookingOrderNote(brand.id, booking.order_id, booking.reference, line).catch(() =>
          toast.warning(
            isAr
              ? "نُقل الحجز، لكن ملاحظة الطلب ما زالت بالموعد القديم."
              : "The booking moved, but its order's note still shows the old date.",
          ),
        );
      }
    },
    onSuccess: async () => {
      await Promise.all([refresh(), invalidateOrders(qc, brand.id)]);
      toast.success(isAr ? "تم نقل الحجز" : "Booking moved");
    },
  });

  // A reminder is sent by a person on WhatsApp; the record keeps it from being offered again.
  const reminderMutation = useMutation({
    mutationFn: (booking: Booking) => recordBookingReminder(brand.id, booking),
    onSuccess: () => refresh(),
    onError: () =>
      toast.error(
        isAr
          ? "تعذّر حفظ أن التذكير أُرسل."
          : "Could not keep a record that the reminder was sent.",
      ),
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
    /** Whether the store can take a deposit: it takes a card or BenefitPay. */
    takesDeposits: takesDeposits(businessSettings),
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
    requests: waiting.requests,
    /** A day held for a BenefitPay transfer whose receipt waits for the store's check. */
    toVerify: waiting.toVerify,
    /** Paid after the hold ran out, its day taken meanwhile: to move, or to cancel and refund. */
    slotTaken: waiting.slotTaken,
    /** The store's travel fees by area code. */
    areaFees: areaFeesQuery.data ?? {},
    setStatus: statusMutation.mutate,
    statusPending: statusMutation.isPending || doneMutation.isPending,
    /** Marks a booking done through its order (collecting what is still owed). */
    completeBooking: doneMutation.mutate,
    /** Moves a booking to another day and start (same length); resolves once moved, throws when refused. */
    moveBooking: moveMutation.mutateAsync,
    movePending: moveMutation.isPending,
    /** Today and the next days' bookings (the agenda), and the bookings already reminded, with when. */
    agendaBookings: agendaQuery.data ?? [],
    agendaLoading: agendaQuery.isLoading,
    reminded: remindersQuery.data ?? new Map<string, string>(),
    /** Keeps a reminder sent (the WhatsApp chat opens from its link). */
    recordReminder: reminderMutation.mutate,
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
