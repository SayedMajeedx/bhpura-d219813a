import { useRef } from "react";

/**
 * Whether a part of a screen has just arrived after waiting for its data: true once it was seen
 * loading during this mount and has stopped. Content shown straight from the cache stays still,
 * and content that waited fades in from its loading shape (`t-skel-reveal`) instead of popping in
 * (the animation review of 2026-11-22).
 */
export function useArrivedAfterWait(loading: boolean): boolean {
  const waited = useRef(loading);
  if (loading) waited.current = true;
  return !loading && waited.current;
}

/** The ids in `ids` that were not in `before`; none on the first reading. */
export function newArrivals(
  before: ReadonlySet<string> | null,
  ids: readonly string[],
): Set<string> {
  if (!before) return new Set();
  return new Set(ids.filter((id) => !before.has(id)));
}

/**
 * The rows that came into a live list since it was first drawn (a new order arriving), so they can
 * slide in instead of jumping the list. Read from the whole list, not one page of it: turning a
 * page shows rows that were there all along.
 */
export function useArrivals(ids: readonly string[] | undefined): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const last = useRef<{ key: string; arrived: ReadonlySet<string> }>({
    key: "",
    arrived: new Set(),
  });
  if (!ids) return last.current.arrived;
  const key = ids.join(",");
  if (key !== last.current.key) {
    const arrived = newArrivals(seen.current, ids);
    seen.current = new Set([...(seen.current ?? []), ...ids]);
    last.current = { key, arrived };
  }
  return last.current.arrived;
}
