import { describe, expect, it } from "vitest";
import {
  addDays,
  byDay,
  clockAt,
  dayTitle,
  phoneDigits,
  placeOf,
  todayIn,
} from "../apps/boutq-os-mobile/src/lib/bookings";

// The merchant app's bookings screen: times in the store's timezone, bookings
// grouped by day, the place, and phone numbers for call and WhatsApp.

describe("mobile bookings", () => {
  it("shows times and days in the store's timezone", () => {
    expect(clockAt("2026-10-10T15:00:00Z", "Asia/Bahrain", false)).toBe("6:00 PM");
    expect(clockAt("2026-10-10T07:30:00Z", "Asia/Bahrain", true)).toBe("10:30 ص");
    expect(todayIn("Asia/Bahrain", new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
    expect(addDays("2026-10-01", 30)).toBe("2026-10-31");
    expect(dayTitle("2026-10-10", false)).toMatch(/Saturday.*10 October/);
  });

  it("groups bookings by day, days in order", () => {
    const groups = byDay([
      { id: "b", event_date: "2026-10-12" },
      { id: "a", event_date: "2026-10-10" },
      { id: "c", event_date: "2026-10-10" },
    ]);
    expect(groups.map(([day, list]) => [day, list.map((b) => b.id)])).toEqual([
      ["2026-10-10", ["a", "c"]],
      ["2026-10-12", ["b"]],
    ]);
  });

  it("reads the place and makes call and WhatsApp numbers", () => {
    expect(placeOf({ venue: "Villa 12", area: "Juffair" })).toBe("Villa 12, Juffair");
    expect(placeOf(null)).toBe("");
    expect(phoneDigits("3900 1122")).toBe("97339001122");
    expect(phoneDigits("+973 3900 1122")).toBe("97339001122");
    expect(phoneDigits("0096655512345")).toBe("96655512345");
    expect(phoneDigits(null)).toBe("");
  });
});
