import { localDateKey } from "./date-range";

/**
 * The period the expenses page shows: a month (this one by default, any other a tap away), days
 * the reader picks, or every period. The page once offered today, this week, this month or all,
 * so an expense of August could only be found under "all".
 */
export type ExpensePeriod =
  { kind: "month"; month: string } | { kind: "range"; from: string; to: string } | { kind: "all" };

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11" for the reader's own month. */
export function monthOf(day: string | Date = new Date()) {
  const key = typeof day === "string" ? day : localDateKey(day);
  return key.slice(0, 7);
}

export function thisMonth(now = new Date()): ExpensePeriod {
  return { kind: "month", month: monthOf(now) };
}

/** The month `delta` months from `month` ("2026-11", -3 → "2026-08"). */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** The days a period covers (`YYYY-MM-DD`); an empty bound is open (every period). */
export function periodDays(period: ExpensePeriod): { from: string; to: string } {
  if (period.kind === "all") return { from: "", to: "" };
  if (period.kind === "range") {
    const [from, to] =
      period.from <= period.to ? [period.from, period.to] : [period.to, period.from];
    return { from, to };
  }
  const [y, m] = period.month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period.month}-01`, to: `${period.month}-${pad(last)}` };
}

/** "November 2026" / "نوفمبر 2026", "1 Aug – 16 Nov 2026", "Every period". */
export function periodLabel(period: ExpensePeriod, lang: "ar" | "en") {
  const locale = lang === "ar" ? "ar-u-nu-latn" : "en-US";
  if (period.kind === "all") return lang === "ar" ? "كل الفترات" : "Every period";
  if (period.kind === "month") {
    const [y, m] = period.month.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
      new Date(Date.UTC(y, m - 1, 15)),
    );
  }
  const { from, to } = periodDays(period);
  const day = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  return from === to ? day(from) : `${day(from)} – ${day(to)}`;
}

/** The period to switch to so an expense of `day` shows: its own month, or the same period. */
export function periodShowing(period: ExpensePeriod, day: string): ExpensePeriod {
  const { from, to } = periodDays(period);
  if ((!from || day >= from) && (!to || day <= to)) return period;
  return { kind: "month", month: monthOf(day) };
}
