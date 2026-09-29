import { isValidSlot, type BookingRules, type DayState } from "@/lib/bookings/rules";
import { normalizeWhatsAppDigits } from "@/lib/storefront-mode";

/**
 * The storefront booking flow as pure rules: a service's "from" price, the
 * total of what the customer picked, what is still missing at each step, and
 * the WhatsApp message that carries the request to the store.
 */

export type BookableService = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  image_url: string | null;
  product_variants: ReadonlyArray<{ id: string; selling_price: number }>;
};

/** The service's cheapest variant: what a booking of it costs ("from"). */
export function cheapestVariant(service: BookableService) {
  let best: { id: string; selling_price: number } | null = null;
  for (const variant of service.product_variants) {
    if (!best || Number(variant.selling_price) < Number(best.selling_price)) best = variant;
  }
  return best;
}

export function fromPrice(service: BookableService): number | null {
  const variant = cheapestVariant(service);
  return variant ? Number(variant.selling_price) : null;
}

/** Services that can be booked: they have a price to book them at. */
export function bookableServices<T extends BookableService>(services: readonly T[]): T[] {
  return services.filter((service) => cheapestVariant(service) !== null);
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
): number {
  return services
    .filter((service) => chosen.includes(service.id))
    .reduce((sum, service) => sum + (fromPrice(service) ?? 0), 0);
}

export type FlowStep = "date" | "services" | "time" | "details";

export type FlowState = {
  day: string | null;
  services: string[];
  durationMinutes: number | null;
  start: string | null;
  name: string;
  phone: string;
  area: string;
  venue: string;
  notes: string;
};

export const EMPTY_FLOW: FlowState = {
  day: null,
  services: [],
  durationMinutes: null,
  start: null,
  name: "",
  phone: "",
  area: "",
  venue: "",
  notes: "",
};

/** The first step the customer still has to finish, or null when it can be sent. */
export function missingStep(
  flow: FlowState,
  rules: BookingRules,
  dayStates: ReadonlyMap<string, DayState>,
): FlowStep | null {
  if (!flow.day || dayStates.get(flow.day) !== "available") return "date";
  if (flow.services.length === 0) return "services";
  if (
    !flow.start ||
    !flow.durationMinutes ||
    !isValidSlot(rules, flow.start, flow.durationMinutes)
  ) {
    return "time";
  }
  const digits = flow.phone.replace(/\D/g, "");
  if (!flow.name.trim() || digits.length < 7 || digits.length > 15) return "details";
  return null;
}

/** The request the database takes (request_booking). */
export function toBookingRequest(
  brandId: string,
  flow: FlowState,
  services: readonly BookableService[],
) {
  const location: Record<string, string> = {};
  if (flow.area) location.area = flow.area;
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
        variant_id: cheapestVariant(service)?.id ?? null,
        quantity: 1,
      })),
    customer: { name: flow.name.trim(), phone: flow.phone.trim() },
    location,
    notes: flow.notes.trim() || undefined,
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
      ];
  return lines.filter(Boolean).join("\n");
}

/** A wa.me link to the store with the message, or null when it has no WhatsApp number. */
export function whatsAppLink(storeNumber: string | null | undefined, text: string): string | null {
  const digits = normalizeWhatsAppDigits(storeNumber);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
