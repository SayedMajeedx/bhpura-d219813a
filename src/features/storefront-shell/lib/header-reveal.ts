/**
 * When the store's header shows. It stays at the top of the page (`zone`: the header's own height),
 * leaves when the shopper scrolls down, and comes back when they scroll up, for a moment
 * (`HEADER_REVEAL_MS`) before leaving again. Held fixed on screen, the announcement bar, the logo
 * row and the navigation took about a fifth of a laptop's screen on every page.
 *
 * A scroll is measured from the last position that moved the header (`HEADER_SCROLL_STEP`), so a
 * slow scroll counts as a scroll and a trackpad's jitter does not.
 */
export const HEADER_REVEAL_MS = 2500;
export const HEADER_SCROLL_STEP = 8;

export type HeaderMove =
  /** At the top: shown, and it stays. */
  | "show"
  /** Scrolling down: it leaves. */
  | "hide"
  /** Scrolling up: shown for a moment. */
  | "reveal"
  /** Too small a move to mean anything. */
  | "keep";

export function headerMove({
  y,
  from,
  zone,
}: {
  /** Where the page is now. */
  y: number;
  /** Where it was when the header last moved. */
  from: number;
  /** The height at the top within which the header always shows. */
  zone: number;
}): HeaderMove {
  if (y <= zone) return "show";
  const delta = y - from;
  if (delta > HEADER_SCROLL_STEP) return "hide";
  if (delta < -HEADER_SCROLL_STEP) return "reveal";
  return "keep";
}
