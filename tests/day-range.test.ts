import { describe, expect, it } from "vitest";
import { localDayRange, startOfLocalDay } from "../src/lib/day-range";

// A period written in days covers the reader's own days. A bare day sent to the database is read
// at midnight UTC, so in Bahrain an order placed at 01:00 on the 1st fell in the month before.
// These hold in any time zone: they are written against the clock of the machine that runs them.

const inRange = (moment: Date, range: { since: string | null; before: string | null }) =>
  (!range.since || moment.toISOString() >= range.since) &&
  (!range.before || moment.toISOString() < range.before);

describe("the start of a day", () => {
  it("is that day's own midnight on this device's clock", () => {
    const start = startOfLocalDay("2026-10-01")!;
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 9, 1]);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("moves by whole days across the end of a month and a year", () => {
    const next = startOfLocalDay("2026-12-31", 1)!;
    expect([next.getFullYear(), next.getMonth(), next.getDate(), next.getHours()]).toEqual([
      2027, 0, 1, 0,
    ]);
  });

  it("is nothing for text that is not a day", () => {
    expect(startOfLocalDay("")).toBeNull();
    expect(startOfLocalDay("yesterday")).toBeNull();
    expect(startOfLocalDay("2026-10-01T10:00:00Z")).toBeNull();
  });
});

describe("a range of whole days", () => {
  const october = localDayRange("2026-10-01", "2026-10-31");

  it("holds the first minutes of its first day and the last of its last", () => {
    expect(inRange(new Date(2026, 9, 1, 0, 30), october)).toBe(true);
    expect(inRange(new Date(2026, 9, 31, 23, 59, 59), october)).toBe(true);
  });

  it("holds nothing of the day before or the day after", () => {
    expect(inRange(new Date(2026, 8, 30, 23, 59, 59), october)).toBe(false);
    expect(inRange(new Date(2026, 10, 1, 0, 0, 0), october)).toBe(false);
  });

  it("is one whole day when it starts and ends on the same day", () => {
    const today = localDayRange("2026-10-12", "2026-10-12");
    expect(Date.parse(today.before!) - Date.parse(today.since!)).toBe(86_400_000);
  });

  it("leaves an empty bound open", () => {
    expect(localDayRange("", "")).toEqual({ since: null, before: null });
    expect(localDayRange("2026-10-01", "").before).toBeNull();
    expect(localDayRange("", "2026-10-31").since).toBeNull();
  });
});
