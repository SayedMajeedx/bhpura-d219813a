import { toWesternDigits } from "@/lib/format";

/**
 * Extracts only digits from a string, normalizing Arabic/Persian numerals first.
 * Returns empty string for empty/null/undefined inputs.
 */
export function extractDigits(value: string | null | undefined): string {
  if (!value) return "";
  const western = toWesternDigits(String(value));
  return western.replace(/\D/g, "");
}

/**
 * Normalizes user search input by trimming, converting to lowercase,
 * and collapsing consecutive whitespace.
 */
export function normalizeSearchQuery(query: string | null | undefined): string {
  if (!query) return "";
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Builds a valid WhatsApp chat URL for a phone number with an optional pre-filled message.
 * Returns an empty string if the phone number contains no valid digits.
 */
export function buildWhatsAppLink(phone: string | null | undefined, message?: string): string {
  const digits = extractDigits(phone);
  if (!digits) return "";
  const base = `https://wa.me/${digits}`;
  if (!message || !message.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}

/**
 * Formats tracking information for display.
 */
export function formatTrackingDisplay(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string {
  const cleanCarrier = (carrier ?? "").trim();
  const cleanTracking = (trackingNumber ?? "").trim();
  if (cleanCarrier && cleanTracking) {
    return `${cleanCarrier} - ${cleanTracking}`;
  }
  return cleanTracking || cleanCarrier || "—";
}
