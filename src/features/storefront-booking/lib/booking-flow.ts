import { isValidSlot, type BookingRules, type DayState } from "@/lib/bookings/rules";
import { normalizeWhatsAppDigits } from "@/lib/storefront-mode";
import {
  bookingQuestions,
  notesWithAnswers,
  unansweredQuestion,
} from "@/features/storefront-booking/lib/booking-questions";

/**
 * The storefront booking flow as pure rules: a service's price (its "from"
 * price, or its price for the chosen duration when the store prices it by
 * duration), the durations the chosen services offer, the total, what is
 * still missing at each step, and the WhatsApp message that carries the
 * request to the store. The database books with the same rules
 * (request_booking picks a duration-priced service's variant by length).
 */

export type ServiceVariant = {
  id: string;
  selling_price: number;
  original_price?: number | null;
  duration_minutes?: number | null;
};

export type BookableService = {
  id: string;
  /** "product" items of a services store are sold through the cart, not booked. */
  item_kind?: string | null;
  /** A package: a service made of other services (what it includes shows with it). */
  is_package?: boolean | null;
  /** The category it is filed under (a rentals category makes it a rental). */
  category?: string | null;
  /** Each hour past its longest length costs this (null: not bookable longer). */
  extra_hour_price?: number | null;
  /** The questions the service asks the customer (booking-questions.ts). */
  custom_fields?: unknown;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  image_url: string | null;
  product_variants: ReadonlyArray<ServiceVariant>;
};

/** The service's cheapest variant: what a booking of it costs ("from"). */
export function cheapestVariant(service: BookableService): ServiceVariant | null {
  let best: ServiceVariant | null = null;
  for (const variant of service.product_variants) {
    if (!best || Number(variant.selling_price) < Number(best.selling_price)) best = variant;
  }
  return best;
}

export function fromPrice(service: BookableService): number | null {
  const variant = cheapestVariant(service);
  return variant ? Number(variant.selling_price) : null;
}

/** The lengths a service priced by duration is offered for (empty when any length will do). */
export function serviceDurations(service: BookableService): number[] {
  const minutes = service.product_variants
    .map((variant) => variant.duration_minutes)
    .filter((value): value is number => typeof value === "number" && value > 0);
  return [...new Set(minutes)].sort((a, b) => a - b);
}

/** What the hours past the service's longest length cost (0 within its lengths or without an extra-hour price). */
export function extraFor(service: BookableService, minutes: number | null | undefined): number {
  const own = serviceDurations(service);
  const rate = Number(service.extra_hour_price ?? 0);
  if (!minutes || own.length === 0 || rate <= 0 || minutes <= own[own.length - 1]) return 0;
  return Math.ceil((minutes - own[own.length - 1]) / 60) * rate;
}

/** The durations the chosen services all offer, among the store's (a service with an extra-hour price offers longer ones too). */
export function offeredDurations(
  storeDurations: readonly number[],
  chosen: readonly BookableService[],
): number[] {
  return storeDurations.filter((minutes) =>
    chosen.every((service) => {
      const own = serviceDurations(service);
      if (own.length === 0 || own.includes(minutes)) return true;
      return Number(service.extra_hour_price ?? 0) > 0 && minutes > own[own.length - 1];
    }),
  );
}

/** The variant a booking of this service uses: its duration's, else the cheapest. */
export function variantFor(
  service: BookableService,
  minutes: number | null | undefined,
): ServiceVariant | null {
  if (serviceDurations(service).length > 0) {
    if (!minutes) return cheapestVariant(service);
    const own = service.product_variants.find((variant) => variant.duration_minutes === minutes);
    if (own) return own;
    // Longer than its longest length: that length's variant, plus the extra hours (priceFor).
    if (extraFor(service, minutes) > 0) {
      const longest = serviceDurations(service).at(-1);
      return (
        service.product_variants.find((variant) => variant.duration_minutes === longest) ?? null
      );
    }
    return null;
  }
  return cheapestVariant(service);
}

/** What the service costs for the chosen duration (its "from" price before one is chosen). */
export function priceFor(
  service: BookableService,
  minutes: number | null | undefined,
): number | null {
  const variant = variantFor(service, minutes);
  return variant ? Number(variant.selling_price) + extraFor(service, minutes) : null;
}

/** Its compare-at price when it is on offer (a package below the sum of its parts). */
export function compareAtFor(
  service: BookableService,
  minutes: number | null | undefined,
): number | null {
  const variant = variantFor(service, minutes);
  const was = Number(variant?.original_price ?? 0);
  return variant && was > Number(variant.selling_price) ? was + extraFor(service, minutes) : null;
}

/** Services that can be booked: services (not the store's products) with a price to book them at. */
export function bookableServices<T extends BookableService>(services: readonly T[]): T[] {
  return services.filter(
    (service) => service.item_kind !== "product" && cheapestVariant(service) !== null,
  );
}

export function serviceName(service: BookableService, isAr: boolean): string {
  return (
    (isAr ? service.name_ar || service.name_en : service.name_en || service.name_ar) || service.name
  );
}

/** The total of the chosen services, at the prices the store will charge. */
export function chosenTotal(
  chosen: readonly string[],
  services: readonly BookableService[],
  minutes?: number | null,
): number {
  return services
    .filter((service) => chosen.includes(service.id))
    .reduce((sum, service) => sum + (priceFor(service, minutes) ?? 0), 0);
}

export type FlowStep = "date" | "services" | "time" | "details";

export type FlowState = {
  day: string | null;
  services: string[];
  durationMinutes: number | null;
  start: string | null;
  name: string;
  phone: string;
  /** The area's label, as the customer read it. */
  area: string;
  /** The area's code (the store's travel fees are set per code). */
  areaCode: string;
  venue: string;
  notes: string;
  /** Answers to the chosen services' questions, by question id. */
  answers: Record<string, string>;
};

export const EMPTY_FLOW: FlowState = {
  day: null,
  services: [],
  durationMinutes: null,
  start: null,
  name: "",
  phone: "",
  area: "",
  areaCode: "",
  venue: "",
  notes: "",
  answers: {},
};

/** The first step the customer still has to finish, or null when it can be sent. */
export function missingStep(
  flow: FlowState,
  rules: BookingRules,
  dayStates: ReadonlyMap<string, DayState>,
  services: readonly BookableService[] = [],
  /** The start times still free for the chosen services and length (null: not known, no limit). */
  freeStarts: ReadonlySet<string> | null = null,
): FlowStep | null {
  if (!flow.day || dayStates.get(flow.day) !== "available") return "date";
  if (flow.services.length === 0) return "services";
  const chosen = services.filter((service) => flow.services.includes(service.id));
  if (
    !flow.start ||
    !flow.durationMinutes ||
    !isValidSlot(rules, flow.start, flow.durationMinutes) ||
    (freeStarts !== null && !freeStarts.has(flow.start)) ||
    chosen.some((service) => variantFor(service, flow.durationMinutes) === null)
  ) {
    return "time";
  }
  const digits = flow.phone.replace(/\D/g, "");
  if (!flow.name.trim() || digits.length < 7 || digits.length > 15) return "details";
  if (unansweredQuestion(bookingQuestions(chosen, false), flow.answers ?? {})) return "details";
  return null;
}

/** The request the database takes (request_booking). */
export function toBookingRequest(
  brandId: string,
  flow: FlowState,
  services: readonly BookableService[],
  isAr = false,
  /** What the customer chose of each service's add-ons (a list once it has add-ons). */
  options: Record<string, Array<{ option_id: string; quantity: number }> | undefined> = {},
) {
  const chosen = services.filter((service) => flow.services.includes(service.id));
  // The customer's notes and their answers to the services' questions (at
  // most the 2,000 characters a booking's notes take).
  const notes = notesWithAnswers(flow.notes, bookingQuestions(chosen, isAr), flow.answers ?? {})
    .slice(0, 2000)
    .trim();
  const location: Record<string, string> = {};
  if (flow.area) location.area = flow.area;
  if (flow.areaCode) location.area_code = flow.areaCode;
  if (flow.venue.trim()) location.venue = flow.venue.trim();
  return {
    brandId,
    day: flow.day ?? "",
    start: flow.start ?? "",
    durationMinutes: flow.durationMinutes ?? 0,
    items: services
      .filter((service) => flow.services.includes(service.id))
      .map((service) => ({
        product_id: service.id,
        variant_id: variantFor(service, flow.durationMinutes)?.id ?? null,
        quantity: 1,
        ...(options[service.id] ? { options: options[service.id] } : {}),
      })),
    customer: { name: flow.name.trim(), phone: flow.phone.trim() },
    location,
    notes: notes || undefined,
  };
}

/** The message the customer sends the store, with everything it needs to confirm. */
export function bookingWhatsAppText({
  isAr,
  brandName,
  reference,
  dayLabel,
  timeLabel,
  services,
  place,
  name,
  totalLabel,
  answers = "",
}: {
  isAr: boolean;
  brandName: string;
  reference: string;
  dayLabel: string;
  timeLabel: string;
  services: string[];
  place: string;
  name: string;
  totalLabel: string | null;
  /** The answers to the services' questions, one per line. */
  answers?: string;
}): string {
  const lines = isAr
    ? [
        `مرحباً ${brandName}، أرغب بتأكيد حجزي:`,
        `رقم الطلب: ${reference}`,
        `التاريخ: ${dayLabel}`,
        `الوقت: ${timeLabel}`,
        `الخدمات: ${services.join("، ")}`,
        place ? `المكان: ${place}` : "",
        totalLabel ? `الإجمالي: ${totalLabel}` : "",
        `الاسم: ${name}`,
        answers,
      ]
    : [
        `Hello ${brandName}, I'd like to confirm my booking:`,
        `Request: ${reference}`,
        `Date: ${dayLabel}`,
        `Time: ${timeLabel}`,
        `Services: ${services.join(", ")}`,
        place ? `Place: ${place}` : "",
        totalLabel ? `Total: ${totalLabel}` : "",
        `Name: ${name}`,
        answers,
      ];
  return lines.filter(Boolean).join("\n");
}

/** A wa.me link to the store with the message, or null when it has no WhatsApp number. */
export function whatsAppLink(storeNumber: string | null | undefined, text: string): string | null {
  const digits = normalizeWhatsAppDigits(storeNumber);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
