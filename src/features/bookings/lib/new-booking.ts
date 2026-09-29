import { isValidSlot, type BookingRules } from "@/lib/bookings/rules";
import type { StaffBookingInput } from "@/lib/data/bookings";

/**
 * The staff "new booking" form as pure rules: which services it books at what
 * price, its total, and what is missing before it can be saved.
 */

export type BookableProduct = {
  id: string;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  base_price: number | null;
  is_active: boolean;
};

/** Chosen services: product id → quantity and the price agreed for one. */
export type ServiceSelection = Record<string, { quantity: number; unit_price: number }>;

export type NewBookingForm = {
  day: string;
  start: string;
  durationMinutes: number;
  customerName: string;
  customerPhone: string;
  area: string;
  venue: string;
  notes: string;
  status: "confirmed" | "requested";
  source: "admin" | "whatsapp";
  allowOverbook: boolean;
  services: ServiceSelection;
};

/** A service's price for one, as the store lists it. */
export function listedPrice(product: BookableProduct): number {
  return Number(product.base_price ?? 0);
}

/** The booking's lines, in the catalog's order, with names kept as they are now. */
export function bookingLines(
  services: ServiceSelection,
  products: readonly BookableProduct[],
): StaffBookingInput["items"] {
  return products
    .filter((product) => services[product.id])
    .map((product) => ({
      product_id: product.id,
      name_en: product.name_en || product.name,
      name_ar: product.name_ar || product.name,
      quantity: services[product.id].quantity,
      unit_price: services[product.id].unit_price,
    }));
}

export function bookingTotal(lines: StaffBookingInput["items"]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
}

export type FormProblem = "day" | "slot" | "services" | "customer" | "price";

/** What stops the form from being saved, in the order to fix it. */
export function formProblems(
  form: NewBookingForm,
  rules: BookingRules,
  lines: StaffBookingInput["items"],
): FormProblem[] {
  const problems: FormProblem[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.day)) problems.push("day");
  if (!isValidSlot(rules, form.start, form.durationMinutes)) problems.push("slot");
  if (lines.length === 0) problems.push("services");
  if (!form.customerName.trim() && !form.customerPhone.trim()) problems.push("customer");
  if (
    lines.some(
      (line) => !Number.isFinite(line.unit_price) || line.unit_price < 0 || line.quantity < 1,
    )
  ) {
    problems.push("price");
  }
  return problems;
}

/** The request create_staff_booking takes. */
export function toStaffBooking(
  brandId: string,
  form: NewBookingForm,
  lines: StaffBookingInput["items"],
): StaffBookingInput {
  const location: Record<string, string> = {};
  if (form.area.trim()) location.area = form.area.trim();
  if (form.venue.trim()) location.venue = form.venue.trim();
  return {
    brandId,
    day: form.day,
    start: form.start,
    durationMinutes: form.durationMinutes,
    customer: {
      name: form.customerName.trim() || undefined,
      phone: form.customerPhone.trim() || undefined,
    },
    items: lines,
    location,
    notes: form.notes.trim() || undefined,
    status: form.status,
    source: form.source,
    allowOverbook: form.allowOverbook,
  };
}
