import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useStorefront } from "@/lib/storefront-context";
import { shouldShowPrices } from "@/lib/storefront-mode";
import { storefrontQueries } from "@/lib/data/storefront";
import {
  bookingErrorMessage,
  bookingsKeys,
  bookingsQueries,
  requestBooking,
  type BookingRequestResult,
} from "@/lib/data/bookings";
import { todayIn, type DayState } from "@/lib/bookings/rules";
import { gridRange, shiftMonth } from "@/lib/bookings/format";
import {
  bookableServices,
  EMPTY_FLOW,
  missingStep,
  toBookingRequest,
  type FlowState,
} from "@/features/storefront-booking/lib/booking-flow";

export const BOOKING_WEEK_STARTS_ON = 0;

/**
 * The storefront booking flow: the store's rules and each day's availability
 * (booked and closed days greyed out), the services it offers, and the
 * customer's choices, sent as a booking request the store confirms.
 */
export function useBookingFlow(initialService?: string) {
  const { brand, settings, lang, currency } = useStorefront();
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const rulesQuery = useQuery(bookingsQueries.publicRules(brand.id));
  const rules = rulesQuery.data ?? null;
  const today = todayIn(rules?.timezone ?? "Asia/Bahrain");

  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const { from, to } = gridRange(cursor.year, cursor.month, BOOKING_WEEK_STARTS_ON);
  const availabilityQuery = useQuery({
    ...bookingsQueries.availability(brand.id, from, to),
    enabled: Boolean(rules),
  });
  const dayStates = useMemo(
    () => new Map((availabilityQuery.data ?? []).map((row) => [row.day, row.state as DayState])),
    [availabilityQuery.data],
  );

  const productsQuery = useQuery(storefrontQueries.products(brand));
  const services = useMemo(() => bookableServices(productsQuery.data ?? []), [productsQuery.data]);

  const [flow, setFlow] = useState<FlowState>(() => ({
    ...EMPTY_FLOW,
    services: initialService ? [initialService] : [],
  }));
  const update = (patch: Partial<FlowState>) => setFlow((current) => ({ ...current, ...patch }));
  const toggleService = (id: string) =>
    setFlow((current) => ({
      ...current,
      services: current.services.includes(id)
        ? current.services.filter((other) => other !== id)
        : [...current.services, id],
    }));

  const [result, setResult] = useState<BookingRequestResult | null>(null);
  const submit = useMutation({
    mutationFn: () => requestBooking(toBookingRequest(brand.id, flow, services)),
    onSuccess: (data) => setResult(data),
    onError: (error: Error) => {
      toast.error(bookingErrorMessage(error.message, isAr));
      // The day may have just filled up: show the calendar as it is now.
      void qc.invalidateQueries({ queryKey: bookingsKeys.all(brand.id) });
    },
  });

  const step = rules ? missingStep(flow, rules, dayStates) : "date";

  return {
    brand,
    settings,
    isAr,
    currency,
    showPrices: shouldShowPrices(settings),
    loading: rulesQuery.isLoading,
    rules,
    today,
    cursor,
    previousMonth: () => setCursor((current) => shiftMonth(current, -1)),
    nextMonth: () => setCursor((current) => shiftMonth(current, 1)),
    dayStates,
    availabilityLoading: availabilityQuery.isLoading,
    services,
    servicesLoading: productsQuery.isLoading,
    flow,
    update,
    toggleService,
    step,
    submit: () => submit.mutate(),
    submitting: submit.isPending,
    result,
    startOver: () => {
      setResult(null);
      setFlow(EMPTY_FLOW);
    },
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;
