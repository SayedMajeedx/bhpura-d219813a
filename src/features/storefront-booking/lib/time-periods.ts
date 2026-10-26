/**
 * The day's start times in three parts (morning, afternoon, evening), so a customer picks a part of
 * the day first and then a time, instead of facing twenty buttons at once. Times are "HH:MM" or
 * "HH:MM:SS" from the store's rules, in the store's own clock.
 */

export type DayPeriodId = "morning" | "noon" | "evening";

export const DAY_PERIODS: ReadonlyArray<{
  id: DayPeriodId;
  ar: string;
  en: string;
  /** First minute of the day that belongs to it. */
  from: number;
}> = [
  { id: "morning", ar: "صباحاً", en: "Morning", from: 0 },
  { id: "noon", ar: "ظهراً", en: "Afternoon", from: 12 * 60 },
  { id: "evening", ar: "مساءً", en: "Evening", from: 17 * 60 },
];

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Which part of the day a time falls in. */
export function periodOf(time: string): DayPeriodId {
  const minutes = minutesOf(time);
  let found: DayPeriodId = "morning";
  for (const period of DAY_PERIODS) if (minutes >= period.from) found = period.id;
  return found;
}

export type PeriodTimes = {
  id: DayPeriodId;
  ar: string;
  en: string;
  /** Every start time of the part, in order. */
  times: string[];
};

/** The parts of the day that have a start time, each with its times. */
export function periodsOf(times: readonly string[]): PeriodTimes[] {
  return DAY_PERIODS.map((period) => ({
    id: period.id,
    ar: period.ar,
    en: period.en,
    times: times.filter((time) => periodOf(time) === period.id),
  })).filter((period) => period.times.length > 0);
}
