/**
 * A list that reorders glides instead of jumping (the FLIP technique, on the browser's own
 * animations, no library): read where each item is before a change, and after it play each
 * item that stayed from its old place to its new one. Items are matched by an attribute
 * (`data-product-id` on a product card). Items that arrived keep their own entrance; items
 * that left are gone. Someone who asked for less motion sees the list change at once.
 */
export type FlipSnapshot = Map<string, { left: number; top: number }>;

export function flipSnapshot(container: Element | null, key: string): FlipSnapshot {
  const places: FlipSnapshot = new Map();
  container?.querySelectorAll<HTMLElement>(`[${key}]`).forEach((el) => {
    const id = el.getAttribute(key);
    if (!id || places.has(id)) return;
    const rect = el.getBoundingClientRect();
    places.set(id, { left: rect.left, top: rect.top });
  });
  return places;
}

/** How far an item moved, so it can start from where it was (0, 0 for a newcomer). */
export function flipOffset(
  before: { left: number; top: number } | undefined,
  after: { left: number; top: number },
): { x: number; y: number } {
  if (!before) return { x: 0, y: 0 };
  return { x: Math.round(before.left - after.left), y: Math.round(before.top - after.top) };
}

const GLIDE = { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

export function playFlip(container: Element | null, key: string, before: FlipSnapshot): void {
  if (!container || before.size === 0) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  container.querySelectorAll<HTMLElement>(`[${key}]`).forEach((el) => {
    const id = el.getAttribute(key);
    if (!id || typeof el.animate !== "function") return;
    const rect = el.getBoundingClientRect();
    const { x, y } = flipOffset(before.get(id), rect);
    // An item off the screen before and after the change has nothing to show.
    const offScreen = (top: number) => top > window.innerHeight * 1.5 || top < -window.innerHeight;
    if ((x === 0 && y === 0) || (offScreen(rect.top) && offScreen(rect.top + y))) return;
    el.animate([{ translate: `${x}px ${y}px` }, { translate: "0 0" }], GLIDE);
  });
}
