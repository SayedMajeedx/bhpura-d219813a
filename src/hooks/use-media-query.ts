import { useSyncExternalStore } from "react";

/** Whether a media query matches now, kept up to date as the screen changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener?.("change", onChange);
      return () => list.removeEventListener?.("change", onChange);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false,
    () => false,
  );
}

/** A phone's width (below Tailwind's `sm`, 640px). */
export const PHONE_QUERY = "(max-width: 639.98px)";
