import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOKING_RULES } from "../src/lib/bookings/rules";
import {
  blockedReasonText,
  combineServiceDays,
  freeStartSet,
  startBlockedReason,
  type StartRow,
} from "../src/features/storefront-booking/lib/service-availability";
import { EMPTY_FLOW, missingStep } from "../src/features/storefront-booking/lib/booking-flow";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

const { fetchServiceAvailability, fetchServiceFreeStarts, bookingsKeys } =
  await import("../src/lib/data/bookings");

// What the storefront learns from the booking engine about the chosen services.

describe("one calendar out of the chosen services' days", () => {
  it("is available only when every service is, and shows the most blocking reason", () => {
    const days = combineServiceDays([
      { product_id: "a", day: "2026-10-10", state: "available", remaining: 2 },
      { product_id: "b", day: "2026-10-10", state: "full", remaining: 0 },
      { product_id: "a", day: "2026-10-11", state: "available", remaining: 2 },
      { product_id: "b", day: "2026-10-11", state: "available", remaining: 1 },
      { product_id: "a", day: "2026-10-12", state: "full", remaining: 0 },
      { product_id: "b", day: "2026-10-12", state: "closed", remaining: 0 },
      { product_id: "a", day: "2026-10-13", state: "something-new", remaining: 0 },
    ]);
    expect(days.get("2026-10-10")).toBe("full");
    expect(days.get("2026-10-11")).toBe("available");
    expect(days.get("2026-10-12")).toBe("closed");
    // A state this version does not know is left out rather than guessed.
    expect(days.has("2026-10-13")).toBe(false);
  });
});

describe("the start times still free", () => {
  const rows: StartRow[] = [
    { start_time: "10:00", free: true, reason: null },
    { start_time: "10:30", free: false, reason: "taken" },
    { start_time: "11:00", free: false, reason: "notice" },
  ];

  it("make a set, or no limit while unknown", () => {
    expect([...(freeStartSet(rows) ?? [])]).toEqual(["10:00"]);
    expect(freeStartSet(undefined)).toBeNull();
    expect(freeStartSet([])?.size).toBe(0);
  });

  it("explain why a time is not free, in both languages", () => {
    expect(startBlockedReason(rows, "10:30")).toBe("taken");
    expect(startBlockedReason(rows, "10:00")).toBeNull();
    expect(blockedReasonText("taken", false)).toBe("Booked");
    expect(blockedReasonText("notice", true)).toBe("يحتاج إشعاراً أطول");
    expect(blockedReasonText(null, false)).toBe("Unavailable");
  });

  it("keep a flow from finishing on a taken time", () => {
    const flow = {
      ...EMPTY_FLOW,
      day: "2026-10-10",
      services: ["booth"],
      durationMinutes: 180,
      start: "10:30",
      name: "Sara",
      phone: "39001122",
    };
    const states = new Map([["2026-10-10", "available" as const]]);
    const free = new Set(["10:00"]);
    expect(missingStep(flow, DEFAULT_BOOKING_RULES, states, [], free)).toBe("time");
    expect(
      missingStep({ ...flow, start: "10:00" }, DEFAULT_BOOKING_RULES, states, [], free),
    ).not.toBe("time");
    // Unknown free times do not stop a booking: the database decides.
    expect(missingStep(flow, DEFAULT_BOOKING_RULES, states, [], null)).not.toBe("time");
  });
});

describe("the engine's calls", () => {
  beforeEach(() => rpc.mockReset());

  it("asks for the chosen services' days, leaving the length out when not chosen yet", async () => {
    rpc.mockResolvedValue({
      data: [{ product_id: "a", day: "2026-10-10", state: "available", remaining: 1 }],
      error: null,
    });
    await fetchServiceAvailability("b1", ["a"], "2026-10-01", "2026-10-31", null);
    expect(rpc).toHaveBeenLastCalledWith("get_service_availability", {
      p_brand_id: "b1",
      p_product_ids: ["a"],
      p_from: "2026-10-01",
      p_to: "2026-10-31",
    });
    await fetchServiceAvailability("b1", ["a"], "2026-10-01", "2026-10-31", 180);
    expect(rpc).toHaveBeenLastCalledWith(
      "get_service_availability",
      expect.objectContaining({ p_duration_minutes: 180 }),
    );
  });

  it("reads start times as HH:MM, and throws the database's error", async () => {
    rpc.mockResolvedValue({
      data: [{ start_time: "10:30:00", free: false, reason: "taken" }],
      error: null,
    });
    expect(await fetchServiceFreeStarts("b1", ["a"], "2026-10-10", 60)).toEqual([
      { start_time: "10:30", free: false, reason: "taken" },
    ]);
    rpc.mockResolvedValue({ data: null, error: new Error("BOOKINGS_DISABLED") });
    await expect(fetchServiceFreeStarts("b1", ["a"], "2026-10-10", 60)).rejects.toThrow(
      "BOOKINGS_DISABLED",
    );
  });

  it("key the answers by the services in any order, under the store's bookings", () => {
    const a = bookingsKeys.serviceDays("b1", ["x", "y"], "f", "t", 60);
    const b = bookingsKeys.serviceDays("b1", ["y", "x"], "f", "t", 60);
    expect(a).toEqual(b);
    expect(a.slice(0, 2)).toEqual(bookingsKeys.all("b1"));
  });
});
