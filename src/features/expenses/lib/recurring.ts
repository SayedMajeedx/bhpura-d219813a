/**
 * A recurring expense, as the database repeats it (migration 20261210100000): a template writes
 * one copy for each month (or year) that has come, on the same day of the month counted from its
 * own date (the 31st falls on a short month's last day), until its repeat is turned off.
 * `recurringDate` is the twin of `expenses_recurring_date`; the screens use it to say what saving
 * will add and when the next one falls, never to write a copy.
 */

export type RecurrencePeriod = "monthly" | "yearly";

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
};
const pad = (n: number) => String(n).padStart(2, "0");

/** The `step`-th date after `start` (`YYYY-MM-DD`), as Postgres adds months and years. */
export function recurringDate(start: string, period: RecurrencePeriod | string, step: number) {
  const { y, m, d } = parse(start);
  const months = (period === "yearly" ? 12 : 1) * step;
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

/** The copies saving a new template dated `start` writes at once: every date after it to today. */
export function datesDueBy(start: string, period: RecurrencePeriod | string, today: string) {
  const dates: string[] = [];
  for (let step = 1; step <= 120; step++) {
    const day = recurringDate(start, period, step);
    if (day > today) break;
    dates.push(day);
  }
  return dates;
}

/** "Sep, Oct and Nov 2026" / "سبتمبر وأكتوبر ونوفمبر 2026": the months a save filled. */
export function monthsText(dates: string[], lang: "ar" | "en") {
  if (!dates.length) return "";
  const fmt = (day: string, withYear: boolean) => {
    const { y, m } = parse(day);
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-US", {
      month: lang === "ar" ? "long" : "short",
      ...(withYear ? { year: "numeric" } : {}),
    }).format(new Date(Date.UTC(y, m - 1, 15)));
  };
  const lastYear = parse(dates[dates.length - 1]).y;
  const sameYear = dates.every((day) => parse(day).y === lastYear);
  const names = dates.map((day, i) => fmt(day, !sameYear || i === dates.length - 1));
  if (names.length === 1) return names[0];
  const and = lang === "ar" ? " و" : " and ";
  const sep = lang === "ar" ? " و" : ", ";
  return `${names.slice(0, -1).join(sep)}${and}${names[names.length - 1]}`;
}

/** Whether a day (`YYYY-MM-DD`) falls inside a period of days; an open end takes anything. */
export function inPeriod(day: string, period: { from?: string; to?: string }) {
  return (!period.from || day >= period.from) && (!period.to || day <= period.to);
}
