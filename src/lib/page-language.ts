/**
 * The page's language as `<html lang>` says it (the root route sets it for the admin and for a
 * store alike). For words a shared component writes on its own, such as a dialog's close button
 * for screen readers: it said "Close" on every Arabic page.
 */
export function pageLanguage(): "ar" | "en" {
  if (typeof document === "undefined") return "en";
  return document.documentElement.lang?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** "Close" in the page's language, read when a dialog or sheet opens. */
export function closeLabel(lang: "ar" | "en" = pageLanguage()): string {
  return lang === "ar" ? "إغلاق" : "Close";
}
