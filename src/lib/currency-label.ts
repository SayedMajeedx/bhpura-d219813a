/**
 * How a currency is named beside an amount or in a field's label ("Price (BHD)", "السعر (د.ب)").
 * English writes the code; Arabic writes the short form its readers know, and the code for a
 * currency this list does not have. Forms once wrote "BHD" and "د.ب" whatever the store used.
 */
const ARABIC_SHORT: Record<string, string> = {
  BHD: "د.ب",
  KWD: "د.ك",
  SAR: "ر.س",
  AED: "د.إ",
  QAR: "ر.ق",
  OMR: "ر.ع",
  JOD: "د.أ",
  EGP: "ج.م",
};

export function currencyLabel(currency: string | null | undefined, lang: "ar" | "en"): string {
  const code = (currency || "BHD").trim().toUpperCase() || "BHD";
  return lang === "ar" ? (ARABIC_SHORT[code] ?? code) : code;
}
