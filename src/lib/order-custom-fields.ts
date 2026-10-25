/**
 * How an order line's answered field (a measurement, a note, a file) reads on the order page,
 * the invoice, the job sheet and the printed label. Lines written from the admin before
 * 2026-10-24 put "Passport — " before every measurement's name; they read as the name alone.
 */
export type OrderCustomField = {
  key?: string | null;
  label_ar?: string | null;
  label_en?: string | null;
  value?: string | null;
};

const OLD_PREFIX = /^\s*(?:fit\s+)?passport\s*[—–-]\s*/i;
const MEASUREMENT = /^(\s*\d+(?:[.,]\d+)?)\s*(in|cm)\s*$/i;

export function customFieldLabel(field: OrderCustomField, lang: "ar" | "en"): string {
  const label = lang === "ar" ? field.label_ar || field.label_en : field.label_en || field.label_ar;
  return (label ?? "").replace(OLD_PREFIX, "").trim() || field.key || "";
}

/** A measurement ("34 in") keeps its unit, in the reader's words ("34 إنش"). */
export function customFieldValue(field: OrderCustomField, lang: "ar" | "en"): string {
  const value = field.value ?? "";
  if (lang !== "ar") return value;
  return value.replace(
    MEASUREMENT,
    (_, n: string, unit: string) => `${n.trim()} ${unit.toLowerCase() === "cm" ? "سم" : "إنش"}`,
  );
}
