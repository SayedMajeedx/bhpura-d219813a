import type { OrderScope } from "./types";

/** How often an orders list is read again: a fallback for the live connection. */
export function orderPollInterval(scope: OrderScope, liveConnected: boolean): number {
  if (scope === "assigned-courier") return liveConnected ? 60_000 : 10_000;
  return liveConnected ? 5 * 60_000 : 30_000;
}
