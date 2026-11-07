/**
 * The posting calendar: the kit's plan with what the store did to it. The plan ships as days; the
 * store's changes are kept apart in one row of the shared record, so a day it never touched follows
 * the plan as the plan is corrected, and an empty record is simply the plan.
 */
export const CALENDAR_KEY = "plan-calendar";
export const READY_FROM = "جاهز في العدة";
/** The plan's first day. Its rows run a day each from here. */
const PLAN_START = Date.UTC(2026, 10, 8);
const DAY_MS = 86_400_000;

export type CalendarDay = {
  date: string;
  kind: string;
  what: string;
  from: string;
  /** The kit's post this day opens, when there is one. */
  post?: string;
  posted?: boolean;
};

type DayChange = Partial<Omit<CalendarDay, "date">>;
export type CalendarState = {
  key: typeof CALENDAR_KEY;
  days: Record<string, DayChange>;
};

export const emptyCalendar = (): CalendarState => ({ key: CALENDAR_KEY, days: {} });

export const dateOfIndex = (index: number) =>
  new Date(PLAN_START + index * DAY_MS).toISOString().slice(0, 10);

const nextDate = (date: string) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);

/** "كاروسيل السكليف: 1 من 3" gives "السكليف": a plan names a carousel, and it opens on its first slide. */
function carouselName(series: string | undefined) {
  if (!series?.startsWith("كاروسيل ")) return "\u0000";
  return series.split(":")[0].replace("كاروسيل ", "");
}

/** The plan's rows as days, each pointing at the post whose title it names (the longest match). */
export function planDays(
  rows: string[][],
  posts: readonly { key: string; title: string; series?: string }[],
): CalendarDay[] {
  const byLength = [...posts].sort((a, b) => b.title.length - a.title.length);
  return rows.map(([, kind, what, from], index) => ({
    date: dateOfIndex(index),
    kind,
    what,
    from,
    post:
      byLength.find((post) => post.title && what.includes(post.title))?.key ??
      posts.find((post) => what.includes(carouselName(post.series)))?.key,
  }));
}

/** The record, or an empty calendar when it cannot be read: one bad row must not stop the page. */
export function readCalendar(value: unknown): CalendarState {
  const days = (value as { days?: unknown } | null)?.days;
  if (typeof days !== "object" || days === null || Array.isArray(days)) return emptyCalendar();
  const clean: CalendarState["days"] = {};
  for (const [date, change] of Object.entries(days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && typeof change === "object" && change !== null) {
      clean[date] = change as DayChange;
    }
  }
  return { key: CALENDAR_KEY, days: clean };
}

/** The plan with the store's changes, in date order, with any days the store added after it. */
export function calendarDays(plan: CalendarDay[], state: CalendarState): CalendarDay[] {
  const byDate = new Map(plan.map((day) => [day.date, day]));
  for (const date of Object.keys(state.days)) {
    if (!byDate.has(date)) byDate.set(date, { date, kind: "", what: "", from: "" });
  }
  return [...byDate.values()]
    .map((day) => ({ ...day, ...state.days[day.date] }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

const change = (state: CalendarState, date: string, patch: DayChange): CalendarState => ({
  ...state,
  days: { ...state.days, [date]: { ...state.days[date], ...patch } },
});

export const withPosted = (state: CalendarState, date: string, posted: boolean) =>
  change(state, date, { posted });

/** A post chosen for a day: it is ready, whatever the plan said the day was waiting for. */
export const withPost = (
  state: CalendarState,
  date: string,
  post: { key: string; title: string },
) => change(state, date, { post: post.key, what: post.title, from: READY_FROM });

/**
 * Moving a post to another day swaps the two days' posts. A post already published stays on the day
 * it went out, so the record of what was published is never rewritten.
 */
export function swapDays(state: CalendarState, a: CalendarDay, b: CalendarDay): CalendarState {
  if (a.posted || b.posted) return state;
  const content = ({ kind, what, from, post }: CalendarDay): DayChange => ({
    kind,
    what,
    from,
    post: post ?? "",
  });
  return change(change(state, a.date, content(b)), b.date, content(a));
}

/** One more empty day after the last, to pick a post for. */
export function withNextDay(state: CalendarState, days: CalendarDay[]): CalendarState {
  const last = days[days.length - 1]?.date ?? dateOfIndex(-1);
  return change(state, nextDate(last), { kind: "", what: "", from: "" });
}

/** Today's date on the reader's own calendar. */
export function localDate(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * What the top of the calendar says: how much went out, and the first day to come with no ready
 * post, which is when the merchant has to make one. A day to film is its own work, not a gap.
 */
export function calendarSummary(days: CalendarDay[], today: string) {
  const posted = days.filter((day) => day.posted).length;
  const upcoming = days.filter((day) => day.date >= today && !day.posted);
  const missed = days.filter((day) => day.date < today && !day.posted).length;
  const nothingReady = upcoming.find((day) => !day.post && !day.what);
  return { posted, total: days.length, missed, nothingReady: nothingReady?.date ?? null };
}
