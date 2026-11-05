/**
 * The number on the installed admin's icon (the PWA review of 2026-11-05): the shoppers' orders
 * that arrived while the app was open and the orders page was not (`newArrivals`), cleared once
 * the orders page is open. While the app is closed the worker marks the icon for a new order
 * (`public/admin-sw.js`); the orders page clears that too. Badging is a browser's own feature
 * (iPhone home-screen apps, Android, desktop Chrome and Edge); elsewhere nothing happens.
 */

/** What the icon shows: a count, nothing, or as it is (`null`: the worker's mark stays). */
export function appBadgeFor(arrivals: number, onOrders: boolean): number | "clear" | null {
  if (onOrders) return "clear";
  if (arrivals > 0) return arrivals;
  return null;
}

type Badging = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function showAppBadge(badge: number | "clear" | null): void {
  if (badge === null || typeof navigator === "undefined") return;
  const nav = navigator as Badging;
  const done = badge === "clear" ? nav.clearAppBadge?.() : nav.setAppBadge?.(badge);
  done?.catch(() => undefined);
}
