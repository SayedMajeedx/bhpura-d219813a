import { describe, expect, it } from "vitest";
import {
  addDays,
  bookingEnd,
  dayState,
  DEFAULT_BOOKING_RULES,
  durations,
  isValidSlot,
  monthGrid,
  nextStatuses,
  startTimes,
  takesPlace,
  toBookingRules,
  todayIn,
  weekdayOf,
  type BookingRules,
} from "../src/lib/bookings/rules";
import { modulesFromAddons } from "../src/lib/addons/addon-compat";
import { resolveStoreModules, STORE_VERTICALS } from "../src/lib/store-profile";
import { getVerticalDefinition } from "../src/lib/verticals/registry";

const rules: BookingRules = { ...DEFAULT_BOOKING_RULES };

describe("start times and durations", () => {
  it("offers start times on the store's grid, from opening to the last start", () => {
    const times = startTimes(rules);
    expect(times[0]).toBe("10:00");
    expect(times[1]).toBe("10:30");
    expect(times.at(-1)).toBe("22:00");
    expect(times).toHaveLength(25);
    expect(startTimes({ ...rules, slot_minutes: 60 })).toHaveLength(13);
  });

  it("offers durations from the shortest to the longest by the store's step", () => {
    expect(durations(rules)).toEqual([180, 240, 300, 360, 420, 480]);
  });

  it("says when a booking ends, including past midnight", () => {
    expect(bookingEnd("18:00", 240)).toEqual({ time: "22:00", nextDay: false });
    expect(bookingEnd("22:00", 180)).toEqual({ time: "01:00", nextDay: true });
  });

  it("accepts only slots the database accepts", () => {
    expect(isValidSlot(rules, "18:30", 240)).toBe(true);
    expect(isValidSlot(rules, "18:15", 240)).toBe(false);
    expect(isValidSlot(rules, "09:30", 240)).toBe(false);
    expect(isValidSlot(rules, "18:00", 210)).toBe(false);
    expect(isValidSlot(rules, "18:00:00", 180)).toBe(true);
  });
});

describe("a day's state", () => {
  const today = "2026-10-01"; // a Thursday
  const state = (day: string, extra: Partial<Parameters<typeof dayState>[0]> = {}) =>
    dayState({ day, today, rules, blocks: [], taken: 0, ...extra }).state;

  it("keeps customers to the notice period and horizon, not staff", () => {
    expect(state("2026-10-01")).toBe("past");
    expect(state("2026-10-02")).toBe("available");
    expect(state(addDays(today, 366))).toBe("beyond");
    expect(state("2026-10-01", { staff: true })).toBe("available");
    expect(state("2026-09-01", { staff: true })).toBe("available");
  });

  it("closes weekdays, blocked days and full days", () => {
    expect(weekdayOf("2026-10-02")).toBe(5);
    expect(state("2026-10-02", { rules: { ...rules, closed_weekdays: [5] } })).toBe("closed");
    expect(
      state("2026-10-05", { blocks: [{ starts_on: "2026-10-04", ends_on: "2026-10-06" }] }),
    ).toBe("blocked");
    expect(state("2026-10-07", { taken: 1 })).toBe("full");
  });

  it("counts the places left", () => {
    const result = dayState({
      day: "2026-10-07",
      today,
      rules: { ...rules, daily_capacity: 3 },
      blocks: [],
      taken: 1,
    });
    expect(result).toEqual({ state: "available", remaining: 2 });
  });

  it("knows today in the store's timezone", () => {
    // 22:30 UTC on 30 Sep is already 1 Oct in Bahrain (UTC+3).
    expect(todayIn("Asia/Bahrain", new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
    expect(todayIn("UTC", new Date("2026-09-30T22:30:00Z"))).toBe("2026-09-30");
  });
});

describe("the month grid", () => {
  it("lays a month out in whole weeks from the chosen first weekday", () => {
    // 1 Sep 2026 is a Tuesday.
    const sundayFirst = monthGrid(2026, 9, 0);
    expect(sundayFirst[0][0]).toEqual({ day: "2026-08-30", inMonth: false });
    expect(sundayFirst[0][2]).toEqual({ day: "2026-09-01", inMonth: true });
    expect(sundayFirst.every((week) => week.length === 7)).toBe(true);
    const saturdayFirst = monthGrid(2026, 9, 6);
    expect(saturdayFirst[0][0].day).toBe("2026-08-29");
    expect(saturdayFirst.flat().filter((cell) => cell.inMonth)).toHaveLength(30);
  });
});

describe("settings rows and statuses", () => {
  it("reads a settings row, times with or without seconds", () => {
    const parsed = toBookingRules({
      open_time: "09:00:00",
      last_start_time: "21:30:00",
      daily_capacity: 2,
      closed_weekdays: [5, "x"],
    });
    expect(parsed.open_time).toBe("09:00");
    expect(parsed.last_start_time).toBe("21:30");
    expect(parsed.daily_capacity).toBe(2);
    expect(parsed.closed_weekdays).toEqual([5]);
    expect(parsed.slot_minutes).toBe(30);
    expect(toBookingRules(null)).toEqual(DEFAULT_BOOKING_RULES);
  });

  it("moves bookings the way set_booking_status allows", () => {
    expect(nextStatuses("requested")).toEqual(["confirmed", "cancelled"]);
    expect(nextStatuses("confirmed")).toEqual(["completed", "cancelled"]);
    expect(nextStatuses("cancelled")).toEqual(["confirmed"]);
    expect(nextStatuses("expired")).toEqual([]);
  });

  it("counts confirmed bookings and live holds, not requests or expired holds", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(takesPlace({ status: "confirmed" }, now)).toBe(true);
    expect(takesPlace({ status: "requested" }, now)).toBe(false);
    expect(takesPlace({ status: "hold", hold_expires_at: "2026-10-01T10:05:00Z" }, now)).toBe(true);
    expect(takesPlace({ status: "hold", hold_expires_at: "2026-10-01T09:55:00Z" }, now)).toBe(
      false,
    );
  });
});

describe("the bookings module", () => {
  it("is on by default for services stores only", () => {
    const on = STORE_VERTICALS.filter((v) => getVerticalDefinition(v).modules.bookings);
    expect(on).toEqual(["services"]);
    expect(resolveStoreModules({ store_vertical: "services" }).bookings).toBe(true);
    expect(resolveStoreModules({ store_vertical: "fashion" }).bookings).toBe(false);
    expect(
      resolveStoreModules({ store_vertical: "gifts", store_modules: { bookings: true } }).bookings,
    ).toBe(true);
  });

  it("follows the store, not its add-ons, when the store has add-ons", () => {
    const rows = [{ addon_id: "made-to-order", status: "installed" }] as never;
    expect(modulesFromAddons(rows, { store_vertical: "services" })).toEqual({
      size_guide: false,
      fit_passport: false,
      made_to_order: true,
      bookings: true,
    });
    expect(modulesFromAddons(rows).bookings).toBe(false);
  });
});
