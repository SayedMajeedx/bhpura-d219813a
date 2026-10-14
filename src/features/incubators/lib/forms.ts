import type { Incubator, StockItem } from "@/features/incubators/types";

/**
 * What the partners' page sends when a form is saved: the form's text turned into the values
 * the database functions take, and what stops a save before it is sent.
 */

type Values = Record<string, FormDataEntryValue | undefined>;
type Lang = "ar" | "en";

const text = (value: FormDataEntryValue | undefined) => String(value ?? "").trim();
const optional = (value: FormDataEntryValue | undefined) => text(value) || null;
const number = (value: FormDataEntryValue | undefined) => Number(text(value) || 0);

/** A partner's details, for a new partner or an edit. */
export function incubatorDetails(values: Values) {
  return {
    name: text(values.name),
    contact_name: optional(values.contact_name),
    phone: optional(values.phone),
    email: optional(values.email),
    commission_type: text(values.commission_type) || "percentage",
    commission_value: number(values.commission_value),
    settlement_day: text(values.settlement_day) ? number(values.settlement_day) : null,
    packaging_policy: text(values.packaging_policy) || "incubator",
    fixed_packaging_cost: number(values.fixed_packaging_cost),
    notes: optional(values.notes),
    // Collected here: the store arranges it with the partner by hand; the checkout shows these.
    pickup_enabled: text(values.pickup_enabled) === "true",
    pickup_address_ar: optional(values.pickup_address_ar),
    pickup_address_en: optional(values.pickup_address_en),
    pickup_location_url: optional(values.pickup_location_url),
    pickup_notes_ar: optional(values.pickup_notes_ar),
    pickup_notes_en: optional(values.pickup_notes_en),
    transfer_days: text(values.transfer_days) ? number(values.transfer_days) : null,
  };
}

export function itemTerms(values: Values, item: Pick<StockItem, "id">) {
  return {
    inventoryId: item.id,
    externalCode: text(values.external_code),
    consignmentPrice: number(values.price),
    commissionType: text(values.commission_type) || "percentage",
    commissionValue: number(values.commission_value),
  };
}

export function saleDetails(
  values: Values,
  incubatorId: string,
  item: Pick<StockItem, "variant_id">,
) {
  return {
    incubatorId,
    variantId: item.variant_id,
    quantity: number(values.quantity),
    unitPrice: number(values.price),
    soldAt: new Date(text(values.sold_at)).toISOString(),
  };
}

export function returnDetails(
  values: Values,
  incubatorId: string,
  item: Pick<StockItem, "variant_id">,
) {
  return {
    incubatorId,
    variantId: item.variant_id,
    quantity: number(values.quantity),
    notes: optional(values.notes),
  };
}

export function paymentDetails(values: Values, incubatorId: string) {
  return {
    incubatorId,
    amount: number(values.amount),
    paymentDate: text(values.payment_date),
    paymentMethod: optional(values.payment_method),
    reference: optional(values.reference),
    notes: optional(values.notes),
  };
}

/** Why a partner's details cannot be saved, or null. */
export function incubatorDetailsProblem(
  details: ReturnType<typeof incubatorDetails>,
  lang: Lang,
): string | null {
  if (!details.name) return lang === "ar" ? "اكتب اسم الحاضنة" : "Enter the partner's name";
  if (details.commission_value < 0) {
    return lang === "ar" ? "العمولة لا تكون بالسالب" : "The commission cannot be negative";
  }
  if (details.commission_type === "percentage" && details.commission_value > 100) {
    return lang === "ar"
      ? "نسبة العمولة لا تتجاوز 100"
      : "A commission percentage cannot exceed 100";
  }
  if (details.pickup_enabled && !details.pickup_address_ar && !details.pickup_address_en) {
    return lang === "ar"
      ? "اكتب عنوان الاستلام ليعرف الزبون أين يذهب"
      : "Enter the pickup address, so a shopper knows where to go";
  }
  if (details.pickup_location_url && !/^https:\/\/\S+$/i.test(details.pickup_location_url)) {
    return lang === "ar" ? "رابط الموقع يبدأ بـ https://" : "The map link starts with https://";
  }
  const transfer = details.transfer_days;
  if (transfer !== null && (!Number.isInteger(transfer) || transfer < 0 || transfer > 60)) {
    return lang === "ar"
      ? "مدة جلب القطعة عدد أيام من 0 إلى 60"
      : "The days to bring a piece are a number from 0 to 60";
  }
  const day = details.settlement_day;
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
    return lang === "ar"
      ? "يوم التسوية رقم من 1 إلى 31"
      : "The settlement day is a number from 1 to 31";
  }
  return null;
}

/** Why a sale cannot be recorded, or null: a whole number the partner holds, a real date. */
export function saleProblem(
  sale: { quantity: number; unitPrice: number; soldAt: string },
  held: number,
  lang: Lang,
  now: Date = new Date(),
): string | null {
  if (!Number.isInteger(sale.quantity) || sale.quantity < 1) {
    return lang === "ar" ? "أدخل كمية صحيحة" : "Enter a whole quantity";
  }
  if (sale.quantity > held) {
    return lang === "ar" ? `الحاضنة لديها ${held} فقط` : `The partner holds only ${held}`;
  }
  if (!(sale.unitPrice >= 0)) {
    return lang === "ar" ? "السعر لا يكون بالسالب" : "The price cannot be negative";
  }
  // A minute of grace for the clock of the device that is filling the form.
  if (new Date(sale.soldAt).getTime() > now.getTime() + 60_000) {
    return lang === "ar" ? "تاريخ البيع في المستقبل" : "The sale date is in the future";
  }
  return null;
}

/** "Now" in the form of a `datetime-local` field, in the device's own time zone. */
export function localDateTimeValue(now: Date = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** The currency a new partner is created in: the store's. */
export function newIncubatorCurrency(
  storeCurrency: string | null | undefined,
  current: Pick<Incubator, "currency"> | null,
): string {
  return String(storeCurrency ?? "").trim() || current?.currency || "BHD";
}
