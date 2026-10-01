import { answersText, bookingQuestions } from "@/features/storefront-booking/lib/booking-questions";
import {
  combineServiceDays,
  freeStartSet,
} from "@/features/storefront-booking/lib/service-availability";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStorefront } from "@/lib/storefront-context";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";
import { bookingCartLines } from "@/lib/bookings/cart";
import { storefrontQueries } from "@/lib/data/storefront";
import { bookingDiscountsQueries } from "@/lib/data/booking-discounts";
import { packageLinesById, servicePackagesQueries } from "@/lib/data/service-packages";
import { packageLinesText } from "@/lib/bookings/service-package";
import { bestDiscount, dayOffer, discountName, type DiscountRule } from "@/lib/bookings/discounts";
import {
  bookingsKeys,
  bookingsQueries,
  holdBooking,
  requestBooking,
  type BookingRequestResult,
} from "@/lib/data/bookings";
import { bookingErrorMessage } from "@/lib/bookings/errors";
import { durations, todayIn, travelFeeFor, type DayState } from "@/lib/bookings/rules";
import { gridRange, shiftMonth } from "@/lib/bookings/format";
import {
  bookableServices,
  chosenTotal,
  EMPTY_FLOW,
  priceFor,
  offeredDurations,
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
export function useBookingFlow(initialService?: string, initialMinutes?: number) {
  const { brand, settings, lang, currency, cart, addToCart, removeFromCart } = useStorefront();
  const navigate = useNavigate();
  const catalog = isCatalogMode(settings);
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
  const storeDayStates = useMemo(
    () => new Map((availabilityQuery.data ?? []).map((row) => [row.day, row.state as DayState])),
    [availabilityQuery.data],
  );

  const productsQuery = useQuery(storefrontQueries.products(brand));
  const services = useMemo(() => bookableServices(productsQuery.data ?? []), [productsQuery.data]);

  const [flow, setFlow] = useState<FlowState>(() => ({
    ...EMPTY_FLOW,
    services: initialService ? [initialService] : [],
    // The length the customer picked on the service's page, if any.
    durationMinutes: initialMinutes ?? null,
  }));
  const update = (patch: Partial<FlowState>) => setFlow((current) => ({ ...current, ...patch }));
  const toggleService = (id: string) =>
    setFlow((current) => ({
      ...current,
      services: current.services.includes(id)
        ? current.services.filter((other) => other !== id)
        : [...current.services, id],
    }));

  // With services chosen, each one's own capacity and notice decide the days and
  // the start times; a failed query leaves the store's calendar (the booking
  // itself is still checked by the database).
  const serviceDaysQuery = useQuery({
    ...bookingsQueries.serviceDays(brand.id, flow.services, from, to, flow.durationMinutes),
    enabled: Boolean(rules) && flow.services.length > 0,
  });
  const dayStates = useMemo(
    () =>
      serviceDaysQuery.data && flow.services.length > 0
        ? combineServiceDays(serviceDaysQuery.data)
        : storeDayStates,
    [serviceDaysQuery.data, flow.services.length, storeDayStates],
  );
  const startsQuery = useQuery({
    ...bookingsQueries.serviceStarts(
      brand.id,
      flow.services,
      flow.day ?? "",
      flow.durationMinutes ?? 0,
    ),
    enabled:
      Boolean(rules) &&
      flow.services.length > 0 &&
      Boolean(flow.day) &&
      Boolean(flow.durationMinutes),
  });
  const startRows = flow.services.length > 0 ? startsQuery.data : undefined;
  const freeStarts = useMemo(() => freeStartSet(startRows), [startRows]);

  // The store's offers (last minute, early bird...): shown on the calendar and
  // in the summary; the database applies the same rule when the booking is made.
  const discountRules: DiscountRule[] =
    useQuery({
      ...bookingDiscountsQueries.public(brand.id),
      enabled: Boolean(rules),
    }).data ?? [];
  const chosenForOffer = services.filter((service) => flow.services.includes(service.id));
  const offer = flow.day
    ? bestDiscount(discountRules, {
        day: flow.day,
        today,
        lines: chosenForOffer.map((service) => ({
          product_id: service.id,
          line_total: priceFor(service, flow.durationMinutes) ?? 0,
        })),
      })
    : null;
  /** The offer to mark on a calendar day: the exact one with services chosen, else the general one. */
  const offerOnDay = (day: string) =>
    chosenForOffer.length > 0
      ? bestDiscount(discountRules, {
          day,
          today,
          lines: chosenForOffer.map((service) => ({
            product_id: service.id,
            line_total: priceFor(service, flow.durationMinutes) ?? 0,
          })),
        })
      : dayOffer(discountRules, day, today);

  // What each package includes, shown with it in the service list.
  const packageRows = useQuery({
    ...servicePackagesQueries.items(brand.id),
    enabled: Boolean(rules) && services.some((service) => service.is_package),
  }).data;
  const packageLines = useMemo(() => packageLinesById(packageRows ?? []), [packageRows]);
  const includesText = (serviceId: string) =>
    packageLinesText(
      packageLines.get(serviceId) ?? [],
      (id) => {
        const item = services.find((candidate) => candidate.id === id);
        return item ? (isAr ? item.name_ar || item.name : item.name_en || item.name) : "";
      },
      isAr,
    );

  const [result, setResult] = useState<BookingRequestResult | null>(null);
  const submit = useMutation({
    mutationFn: () => requestBooking(toBookingRequest(brand.id, flow, services, isAr)),
    onSuccess: (data) => setResult(data),
    onError: (error: Error) => {
      toast.error(bookingErrorMessage(error.message, isAr));
      // The day may have just filled up: show the calendar as it is now.
      void qc.invalidateQueries({ queryKey: bookingsKeys.all(brand.id) });
    },
  });

  // A shop store: hold the day, put the services in the cart, pay at checkout.
  const checkout = useMutation({
    mutationFn: () => holdBooking(toBookingRequest(brand.id, flow, services, isAr)),
    onSuccess: async (hold) => {
      for (const line of cart) if (line.booking) removeFromCart(line.cart_line_id);
      const lines = bookingCartLines(
        hold,
        {
          day: flow.day!,
          start: flow.start!,
          durationMinutes: flow.durationMinutes!,
          depositPercent: rules?.deposit_percent ?? 0,
          travelFee: rules ? travelFeeFor(rules, flow.areaCode) : null,
          discount: hold.discount ?? 0,
          discountLabel: offer ? discountName(offer.rule, isAr) : null,
        },
        services,
      );
      for (const line of lines) addToCart(line);
      await navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
    },
    onError: (error: Error) => {
      toast.error(bookingErrorMessage(error.message, isAr));
      void qc.invalidateQueries({ queryKey: bookingsKeys.all(brand.id) });
    },
  });

  const chosen = services.filter((service) => flow.services.includes(service.id));
  const questions = bookingQuestions(chosen, isAr);
  const step = rules ? missingStep(flow, rules, dayStates, services, freeStarts) : "date";
  const travelFee = rules ? travelFeeFor(rules, flow.areaCode) : null;

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
    availabilityLoading: availabilityQuery.isLoading || serviceDaysQuery.isLoading,
    services,
    servicesLoading: productsQuery.isLoading,
    flow,
    update,
    toggleService,
    step,
    chosen,
    /** The chosen services' questions for the customer, and their answers. */
    questions,
    answers: answersText(questions, flow.answers),
    setAnswer: (id: string, value: string) =>
      setFlow((current) => ({ ...current, answers: { ...current.answers, [id]: value } })),
    /** The start times still free for the chosen services and length (null: not known, no limit). */
    freeStarts,
    startRows,
    /** The durations every chosen service is offered for. */
    lengths: rules ? offeredDurations(durations(rules), chosen) : [],
    /** What a package includes, in words (empty for a service that is not one). */
    includesText,
    /** The offer this booking gets (null: none), and the one to mark on a calendar day. */
    offer,
    offerOnDay,
    /** The services at the chosen duration's prices. */
    servicesTotal: chosenTotal(flow.services, services, flow.durationMinutes),
    /** The trip to the event's area (null: the store charges none). */
    travelFee,
    /** Catalog stores send a request; shop stores hold the day and check out. */
    catalog,
    submit: () => (catalog ? submit.mutate() : checkout.mutate()),
    submitting: submit.isPending || checkout.isPending,
    result,
    startOver: () => {
      setResult(null);
      setFlow(EMPTY_FLOW);
    },
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;
