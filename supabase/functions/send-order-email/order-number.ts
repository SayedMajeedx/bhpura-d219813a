/**
 * A copy of `src/lib/order-number.ts` for this function (it is deployed on its own); the two are
 * run against each other by `tests/order-number.test.ts`.
 *
 * How a store writes its order numbers (the owner's decision of 2026-10-27): its own prefix
 * (`business_settings.order_number_prefix`, up to six letters, digits or dashes) and a least
 * number of digits (`order_number_digits`), so order 1042 reads "PL-01042"; with neither, "#1042"
 * as before. The number keeps counting as it did; only how it is written changes. Every screen,
 * message, invoice and email writes an order's number through `orderNumberLabel`
 * (`tests/design-system-guardrails.test.ts` fails on a "#" written before an invoice number).
 */

export type OrderNumberFormat = {
  order_number_prefix?: string | null;
  order_number_digits?: number | string | null;
};

const PREFIX = /^[A-Za-z0-9-]{1,6}$/;

/** The format as stored, read safely: an unusable prefix or digit count is left out. */
export function readOrderNumberFormat(settings: OrderNumberFormat | null | undefined): {
  prefix: string | null;
  digits: number | null;
} {
  const prefix = settings?.order_number_prefix?.trim() ?? "";
  const digits = Number(settings?.order_number_digits);
  return {
    prefix: PREFIX.test(prefix) ? prefix : null,
    digits: Number.isInteger(digits) && digits >= 1 && digits <= 8 ? digits : null,
  };
}

/**
 * An order's number as the store writes it: "PL-01042", or "#1042" with no prefix. An order with
 * no number yet (a draft) shows the first part of its id, as the screens always did.
 */
export function orderNumberLabel(
  invoiceNumber: number | string | null | undefined,
  settings?: OrderNumberFormat | null,
  fallbackId?: string | null,
): string {
  const raw = invoiceNumber === null || invoiceNumber === undefined ? "" : String(invoiceNumber);
  if (!raw) return fallbackId ? `#${fallbackId.slice(0, 8)}` : "—";
  const { prefix, digits } = readOrderNumberFormat(settings);
  const number = digits && /^\d+$/.test(raw) ? raw.padStart(digits, "0") : raw;
  return prefix ? `${prefix}${number}` : `#${number}`;
}

/**
 * The number where a sentence already names it ("order no. 1042"): as `orderNumberLabel` with a
 * prefix ("PL-01042"), else the bare number with its digits, no "#".
 */
export function orderNumberText(
  invoiceNumber: number | string | null | undefined,
  settings?: OrderNumberFormat | null,
): string {
  const label = orderNumberLabel(invoiceNumber, settings);
  return label.startsWith("#") ? label.slice(1) : label;
}

/**
 * A search as typed, reduced to the number it names: "PL-01042", "#1042" and "1042" all find order
 * 1042 (the prefix, a "#" and leading zeros are left out). Anything else is returned as typed.
 */
export function orderNumberQuery(text: string, settings?: OrderNumberFormat | null): string {
  let query = text.trim();
  const { prefix } = readOrderNumberFormat(settings);
  if (prefix && query.toLowerCase().startsWith(prefix.toLowerCase()))
    query = query.slice(prefix.length);
  if (query.startsWith("#")) query = query.slice(1);
  return /^\d+$/.test(query) ? String(Number(query)) : text.trim();
}
