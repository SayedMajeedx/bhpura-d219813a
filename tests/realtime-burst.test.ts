import { afterEach, describe, expect, it, vi } from "vitest";
import { BURST_WAIT_MS, RealtimeBurst, realtimeFilter } from "../src/lib/realtime-burst";
import { orderPollInterval } from "../src/lib/data/orders/poll-interval";

// Live updates (the speed review of 2026-11-22): one order placed is several changes, and each
// refetched the whole list; every store's changes reached every open admin.

afterEach(() => vi.useRealTimers());

describe("a burst of live changes", () => {
  it("refreshes each list once, after the burst", () => {
    vi.useFakeTimers();
    const flushed: unknown[][] = [];
    const burst = new RealtimeBurst((keys) => flushed.push(keys));
    burst.add(["orders", "b1"]);
    burst.add(["orders", "b1"]);
    burst.add(["reports", "pura"]);
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(BURST_WAIT_MS);
    expect(flushed).toEqual([
      [
        ["orders", "b1"],
        ["reports", "pura"],
      ],
    ]);
    burst.add(["orders", "b1"]);
    vi.advanceTimersByTime(BURST_WAIT_MS);
    expect(flushed).toHaveLength(2);
  });

  it("refreshes nothing once the screen has gone", () => {
    vi.useFakeTimers();
    const flushed: unknown[] = [];
    const burst = new RealtimeBurst((keys) => flushed.push(keys));
    burst.add(["orders", "b1"]);
    burst.stop();
    vi.advanceTimersByTime(BURST_WAIT_MS * 2);
    expect(flushed).toEqual([]);
  });

  it("asks the server for the store's own rows only", () => {
    expect(realtimeFilter("b1")).toEqual({ filter: "brand_id=eq.b1" });
    expect(realtimeFilter()).toEqual({});
  });
});

describe("reading the orders list again", () => {
  it("waits minutes while the live connection brings changes, and polls when it is down", () => {
    expect(orderPollInterval("office", true)).toBe(300_000);
    expect(orderPollInterval("office", false)).toBe(30_000);
    expect(orderPollInterval("assigned-courier", false)).toBe(10_000);
    expect(orderPollInterval("assigned-courier", true)).toBe(60_000);
  });
});
