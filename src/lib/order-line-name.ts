import { formatDuration } from "@/lib/bookings/format";

/**
 * An order line's name in the reader's language: the order screen's, or the invoice's.
 *
 * A line with its own names (a booking's add-on, a package's service, extra time: migration
 * `20261025120000`, `order_items.name_ar` / `name_en`) is named by them. A line whose text is its
 * product's name is named by the product, in that language when the product has both names.
 * Otherwise the line's text as it was written (`description`): what a person wrote stays. An Arabic store's order and its customer's Arabic invoice
 * once read "photobooth", "+ Instant prints" and "+ Extra time".
 */

type Named = { name?: string | null; name_ar?: string | null; name_en?: string | null };

export type NamedOrderLine = Named & {
  description?: string | null;
  /** The line's product, as an order read joins it (`products(...)`) or the editor finds it. */
  products?: Named | null;
  product?: Named | null;
};

const text = (value: string | null | undefined) => (value ?? "").trim();

function inLanguage(named: Named, lang: "ar" | "en"): string {
  const [first, second] =
    lang === "ar" ? [named.name_ar, named.name_en] : [named.name_en, named.name_ar];
  return text(first) || text(second);
}

export function orderLineName(line: NamedOrderLine, lang: "ar" | "en"): string {
  const own = inLanguage(line, lang);
  if (own) return own;
  const written = text(line.description);
  const product = line.products ?? line.product ?? null;
  if (product) {
    // The order builder writes the product's own name; a person may write more ("Abaya - Code
    // SS7"), and what they wrote stays.
    const productNames = [product.name, product.name_ar, product.name_en].map(text);
    if (!written || productNames.includes(written)) {
      return inLanguage(product, lang) || text(product.name) || written;
    }
  }
  return written;
}

/**
 * A booked service's length, in the reader's language ("3 ساعات"), from its variant's minutes;
 * null for a variant with no length. A length variant is named in one language ("3 hours").
 */
export function serviceLengthLabel(
  variant: { duration_minutes?: number | null } | null | undefined,
  lang: "ar" | "en",
): string | null {
  const minutes = Number(variant?.duration_minutes ?? 0);
  return minutes > 0 ? formatDuration(minutes, lang === "ar") : null;
}
