import { readHours, type HoursWindow } from "@/lib/opening-hours";

/**
 * What the footer says about reaching the store and paying it (the footer review of 2026-11-15:
 * the footer named no way to reach the store, and its payment chips read "COD").
 *
 * Only what the store's settings say: its WhatsApp number while WhatsApp is on, its opening hours
 * while they are on, and the payment methods it switched on. A card payment goes through Tap's
 * own page, whose methods the store set up at Tap, so the footer names Visa and Mastercard only:
 * it once also promised Apple Pay to every store that takes cards.
 */

export type PaymentMark = "benefit" | "visa" | "mastercard" | "cod";

export function paymentMarks(settings: {
  benefit_enabled?: boolean | null;
  card_enabled?: boolean | null;
  cod_enabled?: boolean | null;
}): PaymentMark[] {
  const marks: PaymentMark[] = [];
  if (settings.benefit_enabled) marks.push("benefit");
  if (settings.card_enabled) marks.push("visa", "mastercard");
  if (settings.cod_enabled) marks.push("cod");
  return marks;
}

const DAY_NAMES = {
  ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
} as const;

/** The Gulf's week, Saturday first. */
const WEEK = [6, 0, 1, 2, 3, 4, 5];

const windowsText = (windows: HoursWindow[], lang: "ar" | "en") =>
  windows.length === 0
    ? lang === "ar"
      ? "مغلق"
      : "Closed"
    : windows.map((w) => `${w.from}–${w.to}`).join(lang === "ar" ? "، " : ", ");

/**
 * The store's opening hours as short lines, days with the same hours put together:
 * "Sat – Thu  10:00–22:00", "Fri  16:00–22:00". None while the store has not turned them on.
 */
export function hoursLines(
  raw: unknown,
  lang: "ar" | "en",
): Array<{ days: string; hours: string }> {
  const hours = readHours(raw);
  if (!hours.enabled) return [];
  const names = DAY_NAMES[lang];
  const runs: Array<{ from: number; to: number; text: string }> = [];
  for (const day of WEEK) {
    const text = windowsText(hours.days[day], lang);
    const last = runs[runs.length - 1];
    if (last && last.text === text) last.to = day;
    else runs.push({ from: day, to: day, text });
  }
  if (runs.every((run) => run.text === (lang === "ar" ? "مغلق" : "Closed"))) return [];
  if (runs.length === 1) {
    return [{ days: lang === "ar" ? "كل يوم" : "Every day", hours: runs[0].text }];
  }
  return runs.map((run) => ({
    days: run.from === run.to ? names[run.from] : `${names[run.from]} – ${names[run.to]}`,
    hours: run.text,
  }));
}
