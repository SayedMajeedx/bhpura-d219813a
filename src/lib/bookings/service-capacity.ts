/**
 * A service's own booking rules (products.booking_capacity, booking_scope,
 * booking_buffer_minutes, booking_notice_hours; migration 20261001180000).
 * The database enforces them (see the booking engine's capacity functions);
 * these are the pure pieces around that: reading a service's rules, the
 * editor's form and its validation, the columns to save, and the words a
 * merchant and a customer read them in.
 */

export type BookingScope = "day" | "time";

export type ServiceBookingRules = {
  /** How many bookings of it may run at once; null: only the store's daily places limit it. */
  capacity: number | null;
  /** day: a booking keeps its unit all day (an event); time: only for its own hours. */
  scope: BookingScope;
  /** Setup and clean-up kept free before and after a booking (time scope). */
  bufferMinutes: number;
  /** Its own minimum notice in hours; null: the store's lead days. */
  noticeHours: number | null;
};

export const DEFAULT_SERVICE_BOOKING: ServiceBookingRules = {
  capacity: null,
  scope: "day",
  bufferMinutes: 0,
  noticeHours: null,
};

export const MAX_CAPACITY = 50;
export const MAX_BUFFER_MINUTES = 480;
export const MAX_NOTICE_HOURS = 8760;

type Row = {
  booking_capacity?: number | null;
  booking_scope?: string | null;
  booking_buffer_minutes?: number | null;
  booking_notice_hours?: number | null;
};

const whole = (value: unknown): number | null => {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isInteger(n) ? n : null;
};

/** A service's rules from its product row (a product with none set gets the defaults). */
export function serviceBookingFrom(row: Row | null | undefined): ServiceBookingRules {
  return {
    capacity: whole(row?.booking_capacity),
    scope: row?.booking_scope === "time" ? "time" : "day",
    bufferMinutes: whole(row?.booking_buffer_minutes) ?? 0,
    noticeHours: whole(row?.booking_notice_hours),
  };
}

/** The editor's form: numbers as the text of their inputs ("" = none). */
export type ServiceBookingForm = {
  booking_capacity: string;
  booking_scope: BookingScope;
  booking_buffer_minutes: string;
  booking_notice_hours: string;
};

export function serviceBookingForm(row: Row | null | undefined): ServiceBookingForm {
  const rules = serviceBookingFrom(row);
  return {
    booking_capacity: rules.capacity === null ? "" : String(rules.capacity),
    booking_scope: rules.scope,
    booking_buffer_minutes: rules.bufferMinutes === 0 ? "" : String(rules.bufferMinutes),
    booking_notice_hours: rules.noticeHours === null ? "" : String(rules.noticeHours),
  };
}

/** The rules a form's text values describe (blank or invalid values read as none). */
export function serviceBookingRulesOfForm(form: ServiceBookingForm): ServiceBookingRules {
  const capacity = whole(form.booking_capacity.trim());
  return {
    capacity,
    scope: form.booking_scope,
    bufferMinutes: whole(form.booking_buffer_minutes.trim()) ?? 0,
    noticeHours: whole(form.booking_notice_hours.trim()),
  };
}

const outside = (text: string, min: number, max: number) => {
  if (text.trim() === "") return false;
  const n = Number(text);
  return !Number.isInteger(n) || n < min || n > max;
};

/** Why the form can't be saved, or null. */
export function serviceBookingError(form: ServiceBookingForm, isAr: boolean): string | null {
  if (outside(form.booking_capacity, 1, MAX_CAPACITY)) {
    return isAr
      ? `عدد الحجوزات المتزامنة رقم صحيح من 1 إلى ${MAX_CAPACITY}.`
      : `Bookings at once must be a whole number from 1 to ${MAX_CAPACITY}.`;
  }
  if (outside(form.booking_buffer_minutes, 0, MAX_BUFFER_MINUTES)) {
    return isAr
      ? `وقت التجهيز بالدقائق من 0 إلى ${MAX_BUFFER_MINUTES}.`
      : `Setup time is minutes from 0 to ${MAX_BUFFER_MINUTES}.`;
  }
  if (outside(form.booking_notice_hours, 0, MAX_NOTICE_HOURS)) {
    return isAr
      ? "الإشعار المسبق بالساعات، رقم صحيح من 0 إلى 8760."
      : "Notice is whole hours from 0 to 8760.";
  }
  return null;
}

/** The product columns to save. A product (not a service) keeps none of it. */
export function serviceBookingColumns(form: ServiceBookingForm, isService: boolean) {
  if (!isService) {
    return {
      booking_capacity: null,
      booking_scope: "day" as BookingScope,
      booking_buffer_minutes: 0,
      booking_notice_hours: null,
    };
  }
  const capacity = whole(form.booking_capacity.trim());
  return {
    booking_capacity: capacity,
    booking_scope: form.booking_scope,
    // Setup time only means something for a service kept by the hour.
    booking_buffer_minutes:
      capacity !== null && form.booking_scope === "time"
        ? (whole(form.booking_buffer_minutes.trim()) ?? 0)
        : 0,
    booking_notice_hours: whole(form.booking_notice_hours.trim()),
  };
}

function hoursText(hours: number, isAr: boolean): string {
  if (hours % 24 === 0 && hours >= 48) {
    const days = hours / 24;
    return isAr ? `${days} أيام` : `${days} days`;
  }
  if (hours === 24) return isAr ? "يوم" : "1 day";
  if (hours === 1) return isAr ? "ساعة" : "1 hour";
  if (hours === 2) return isAr ? "ساعتان" : "2 hours";
  return isAr ? `${hours} ساعة` : `${hours} hours`;
}

/** A merchant-facing summary of a service's rules, as short phrases. */
export function describeServiceBooking(rules: ServiceBookingRules, isAr: boolean): string[] {
  const lines: string[] = [];
  if (rules.capacity !== null) {
    lines.push(
      isAr
        ? rules.capacity === 1
          ? "حجز واحد في الوقت نفسه"
          : `حتى ${rules.capacity} حجوزات في الوقت نفسه`
        : rules.capacity === 1
          ? "One booking at a time"
          : `Up to ${rules.capacity} bookings at once`,
    );
    lines.push(
      rules.scope === "day"
        ? isAr
          ? "تُحجز لليوم كاملاً"
          : "Kept for the whole day"
        : isAr
          ? "تُحجز لساعاتها فقط"
          : "Kept only for its own hours",
    );
    if (rules.scope === "time" && rules.bufferMinutes > 0) {
      lines.push(
        isAr
          ? `${rules.bufferMinutes} دقيقة تجهيز بين الحجوزات`
          : `${rules.bufferMinutes} min between bookings`,
      );
    }
  }
  if (rules.noticeHours !== null) {
    lines.push(
      rules.noticeHours === 0
        ? isAr
          ? "بدون إشعار مسبق"
          : "No notice needed"
        : isAr
          ? `إشعار مسبق ${hoursText(rules.noticeHours, true)}`
          : `${hoursText(rules.noticeHours, false)} notice`,
    );
  }
  return lines;
}
