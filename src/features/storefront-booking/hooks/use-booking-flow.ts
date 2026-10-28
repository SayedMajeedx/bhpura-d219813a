import { answersText, bookingQuestions } from "@/features/storefront-booking/lib/booking-questions";
import {
  combineServiceDays,
  freeStartSet,
} from "@/features/storefront-booking/lib/service-availability";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStorefront } from "@/lib/storefront-context";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";
import { bookingCartLines } from "@/lib/bookings/cart";
import { storefrontQueries } from "@/lib/data/storefront";
import { bookingDiscountsQueries } from "@/lib/data/booking-discounts";
import { optionsOf, serviceOptionsQueries } from "@/lib/data/service-options";
import {
  chosenOptions,
  cleanSelection,
  extraHoursOf,
  defaultSelection,
  optionsPayload,
  type OptionSelection,
} from "@/lib/bookings/service-options";
import { packageLinesById, servicePackagesQueries } from "@/lib/data/service-packages";
import { packageLength, packageLinesText, separatePrice } from "@/lib/bookings/service-package";
import { bookingPageOptionsQueries } from "@/lib/data/booking-page-options";
import { packageStyleFrom } from "@/lib/bookings/package-style";
import { bestDiscount, dayOffer, offersLegend, type DiscountRule } from "@/lib/bookings/discounts";
import {
  bookingsKeys,
  bookingsQueries,
  holdBooking,
  requestBooking,
  type BookingRequestResult,
} from "@/lib/data/bookings";
import { bookingErrorMessage } from "@/lib/bookings/errors";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
import { depositTerms } from "@/lib/bookings/deposit";
import { durations, todayIn, travelFeeFor, type DayState } from "@/lib/bookings/rules";
import { gridRange, shiftMonth } from "@/lib/bookings/format";
import {
  MAX_AUTO_MONTHS,
  bookableServices,
  monthHasAvailableDay,
  chosenTotal,
  EMPTY_FLOW,
  priceFor,
  offeredDurations,
  missingStep,
  toBookingRequest,
  variantFor,
  type BookableService,
  type FlowState,
} from "@/features/storefront-booking/lib/booking-flow";
import { offersQueries } from "@/lib/data/offers";
import { appliedOfferName } from "@/lib/offers";
import { betterBookingOffer } from "@/lib/bookings/booking-offer";

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
  const policy = useQuery(bookingPoliciesQueries.policy(brand.id)).data;
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
  // The calendar opens on a month with a day to book: late in a month with nothing left, it moves
  // on by itself (a few months at most), and never once the customer has chosen a month.
  const movedMonth = useRef(false);
  const skippedMonths = useRef(0);
  const storeDayStates = useMemo(
    () => new Map((availabilityQuery.data ?? []).map((row) => [row.day, row.state as DayState])),
    [availabilityQuery.data],
  );

  useEffect(() => {
    if (!rules || movedMonth.current || skippedMonths.current >= MAX_AUTO_MONTHS) return;
    if (!availabilityQuery.isSuccess || availabilityQuery.isFetching) return;
    if (monthHasAvailableDay(storeDayStates, cursor.year, cursor.month)) {
      movedMonth.current = true;
      return;
    }
    skippedMonths.current += 1;
    setCursor((current) => shiftMonth(current, 1));
  }, [rules, availabilityQuery.isSuccess, availabilityQuery.isFetching, storeDayStates, cursor]);

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
  const ruleOffer = flow.day
    ? bestDiscount(discountRules, {
        day: flow.day,
        today,
        lines: chosenForOffer.map((service) => ({
          product_id: service.id,
          line_total: priceFor(service, flow.durationMinutes) ?? 0,
        })),
      })
    : null;
  // The store's automatic offers on the chosen services, priced by the database
  // (storefront_offers_preview); the booking takes whichever saves more, as the database does
  // when the day is held (apply_booking_discount).
  const liveStoreOffers = useQuery(offersQueries.live(brand.slug, Boolean(rules))).data ?? [];
  const offerItems = chosenForOffer.flatMap((service) => {
    const variant = variantFor(service, flow.durationMinutes);
    return variant
      ? [
          {
            variant_id: variant.id,
            quantity: 1,
            line_total: priceFor(service, flow.durationMinutes) ?? 0,
          },
        ]
      : [];
  });
  const storePreview = useQuery(
    offersQueries.preview(
      brand.slug,
      { items: offerItems, promoCode: null, fulfillment: "appointment", country: null },
      liveStoreOffers.length > 0 && Boolean(flow.day),
    ),
  ).data;
  const storeApplied = storePreview?.applied.find((applied) => applied.kind !== "free_delivery");
  const offer = betterBookingOffer(
    ruleOffer,
    storePreview && storePreview.offer_discount > 0 && storeApplied
      ? { amount: storePreview.offer_discount, name: appliedOfferName(storeApplied, lang) }
      : null,
    isAr,
  );
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
  const includedNames = (id: string) => {
    const item = services.find((candidate) => candidate.id === id);
    return item ? (isAr ? item.name_ar || item.name : item.name_en || item.name) : "";
  };
  /** What a package includes, one entry per service ("Prints × 2"). */
  const includesList = (serviceId: string): string[] =>
    (packageLines.get(serviceId) ?? [])
      .map((line) => {
        const name = includedNames(line.product_id);
        return line.quantity > 1 ? `${name} × ${line.quantity}` : name;
      })
      .filter(Boolean);
  /**
   * What a package's services cost apart at the package's own length (the chosen one, else its
   * "from" price's), as the home card and the package's page compare them; null when unknown.
   */
  const packageApart = (service: BookableService, minutes: number | null): number | null =>
    separatePrice(
      packageLines.get(service.id) ?? [],
      services.map((item) => ({ id: item.id, variants: item.product_variants })),
      packageLength(service.product_variants, minutes),
    );
  const packageStyle = packageStyleFrom(
    useQuery({
      ...bookingPageOptionsQueries.options(brand.id),
      enabled: Boolean(rules) && services.some((service) => service.is_package),
    }).data?.package_style,
  );
  const includesText = (serviceId: string) =>
    packageLinesText(
      packageLines.get(serviceId) ?? [],
      (id) => {
        const item = services.find((candidate) => candidate.id === id);
        return item ? (isAr ? item.name_ar || item.name : item.name_en || item.name) : "";
      },
      isAr,
    );

  // The add-ons of each service: what comes with it, what is on by default, what the
  // customer adds. Their choice is kept per service; untouched means the defaults.
  const allOptions = useQuery({
    ...serviceOptionsQueries.list(brand.id),
    enabled: Boolean(rules),
  }).data;
  const optionsOfService = (serviceId: string) =>
    optionsOf(allOptions, serviceId).filter((option) => option.is_active);
  const [optionChoices, setOptionChoices] = useState<Record<string, OptionSelection>>({});
  const selectionFor = (serviceId: string): OptionSelection =>
    optionChoices[serviceId] ?? defaultSelection(optionsOfService(serviceId));
  const setOptionQuantity = (serviceId: string, optionId: string, quantity: number) =>
    setOptionChoices((current) => {
      const selection = {
        ...(current[serviceId] ?? defaultSelection(optionsOfService(serviceId))),
      };
      if (quantity <= 0) delete selection[optionId];
      else selection[optionId] = quantity;
      // Taking off what another add-on needs takes that one off with it (the prints, then the magnets).
      return { ...current, [serviceId]: cleanSelection(optionsOfService(serviceId), selection) };
    });
  // An add-on priced by the hour follows the chosen length: its price is for the service's
  // shortest length and each hour beyond adds the hourly price (as the database prices it).
  const extraHoursFor = (serviceId: string) => {
    const lengths = (services.find((service) => service.id === serviceId)?.product_variants ?? [])
      .map((variant) => variant.duration_minutes)
      .filter((minutes): minutes is number => typeof minutes === "number");
    return extraHoursOf(flow.durationMinutes, lengths.length > 0 ? Math.min(...lengths) : null);
  };
  const optionLines = flow.services.flatMap((serviceId) =>
    chosenOptions(optionsOfService(serviceId), selectionFor(serviceId), extraHoursFor(serviceId)),
  );
  const optionsTotalValue = optionLines.reduce((sum, line) => sum + line.price, 0);
  const optionPayloads = Object.fromEntries(
    flow.services.map((serviceId) => [
      serviceId,
      optionsPayload(optionsOfService(serviceId), selectionFor(serviceId)),
    ]),
  );

  const [result, setResult] = useState<BookingRequestResult | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      requestBooking(toBookingRequest(brand.id, flow, services, isAr, optionPayloads)),
    onSuccess: (data) => setResult(data),
    onError: (error: Error) => {
      toast.error(bookingErrorMessage(error.message, isAr));
      // The day may have just filled up: show the calendar as it is now.
      void qc.invalidateQueries({ queryKey: bookingsKeys.all(brand.id) });
    },
  });

  // A shop store: hold the day, put the services in the cart, pay at checkout.
  const checkout = useMutation({
    mutationFn: () => holdBooking(toBookingRequest(brand.id, flow, services, isAr, optionPayloads)),
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
          optionsTotal: hold.options_total ?? 0,
          customer: { name: flow.name.trim(), phone: flow.phone.trim() },
          place: { area: flow.area, venue: flow.venue.trim() },
          notes: toBookingRequest(brand.id, flow, services, isAr).notes ?? null,
          // The database's own name for the discount it chose (a booking offer or the store's).
          discountLabel:
            (isAr ? hold.discount_label_ar : hold.discount_label_en) ??
            hold.discount_label_en ??
            hold.discount_label_ar ??
            offer?.label ??
            null,
          discountFromOffer: hold.discount_from_offer === true,
          offersCombine: hold.offers_combine ?? "best",
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
    previousMonth: () => {
      movedMonth.current = true;
      setCursor((current) => shiftMonth(current, -1));
    },
    nextMonth: () => {
      movedMonth.current = true;
      setCursor((current) => shiftMonth(current, 1));
    },
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
    /** The add-ons: each service's, the choice made, what is chosen with prices, and the total. */
    optionsOfService,
    selectionFor,
    extraHoursFor,
    setOptionQuantity,
    optionLines,
    optionsTotal: optionsTotalValue,
    /** What a package includes, in words (empty for a service that is not one). */
    includesText,
    includesList,
    packageApart,
    /** How packages stand out on the page (the merchant's pick). */
    packageStyle,
    /** The offer this booking gets (null: none), and the one to mark on a calendar day. */
    offer,
    offerOnDay,
    /** "up to 25% off · free gift" for the calendar (null: no offers). */
    offersLegendText: offersLegend(discountRules, isAr),
    /** The services at the chosen duration's prices. */
    servicesTotal: chosenTotal(flow.services, services, flow.durationMinutes),
    /** What the chosen services cost for a length: each length's own price, else the longest's
     *  with its extra hours (a 5-hour package's 6 hours), shown under the length to choose. */
    totalFor: (minutes: number) => chosenTotal(flow.services, services, minutes),
    /** The trip to the event's area (null: the store charges none). */
    travelFee,
    /** The deposit the booking really takes (by card only) and when the rest is due. */
    deposit: depositTerms(rules, settings, policy),
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
