/**
 * A phone number as WhatsApp's links want it: digits only, no leading zeros,
 * with the country's code. A store keeps a Bahraini number as its 8 digits
 * (Bahrain is added) and a Saudi mobile as 9 digits starting with 5.
 */
export function normalizePhoneForWhatsApp(phoneStr: string | null | undefined): string {
  if (!phoneStr) return "";
  let clean = phoneStr.replace(/[^\d]/g, "");
  clean = clean.replace(/^0+/, "");
  if (clean.length === 8) return `973${clean}`;
  if (clean.length === 9 && clean.startsWith("5")) return `966${clean}`;
  return clean;
}

/** A chat with the number on WhatsApp, or null when there is no number to reach. */
export function whatsappChatUrl(phone: string | null | undefined): string | null {
  const digits = normalizePhoneForWhatsApp(phone);
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
