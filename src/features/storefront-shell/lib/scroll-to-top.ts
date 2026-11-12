/**
 * A tapped page opens at its top (the owner's report of 2026-11-12: "Gift cards" from the footer
 * sometimes opened at the bottom of the page). The router scrolls to the top once, when the new
 * page is drawn; on a phone that one jump is lost when the tap comes while the page is still
 * gliding from a flick or bouncing at its end, as the scroll's own motion carries on over it. And
 * a link to the page already shown (the store's home from the home page) is no navigation at all,
 * so nothing scrolled.
 *
 * These rules say when the storefront holds the top after a page opens, and which taps are a link
 * to the page already shown. A move back or forward keeps the router's own restoring, a link to
 * a place on the page (`#…`) its own scrolling, and a filter or a sort (the same page, another
 * query) stays where it is.
 */

export type HistoryMove = "PUSH" | "REPLACE" | "BACK" | "FORWARD" | "GO";

/** A new page was opened by a tap or a redirect: it shows from its top. */
export function opensAtTop(move: {
  action: HistoryMove | null;
  pathChanged: boolean;
  hash: string;
}): boolean {
  if (!move.pathChanged || move.hash) return false;
  return move.action === "PUSH" || move.action === "REPLACE";
}

/**
 * The moments after a page opens at which the top is asked for again (ms), while the shopper has
 * not scrolled themself: past a glide's last frames and a bounce at the page's end.
 */
export const HOLD_TOP_MS = [0, 80, 200, 400, 700] as const;

/** What the shopper does that says they are scrolling now: the top is not held against it. */
export const SHOPPER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * A tap on a link to the page already shown (same address and query, no `#…`), which the router
 * does not treat as a move: the page goes back to its top instead. A tap that opens a new tab or
 * a file, or a link elsewhere, is not one.
 */
export function linkToShownPage(
  link: { href: string; target?: string | null; download?: boolean },
  click: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  shown: { origin: string; pathname: string; search: string },
): boolean {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) {
    return false;
  }
  if ((link.target && link.target !== "_self") || link.download) return false;
  let url: URL;
  try {
    url = new URL(link.href, shown.origin);
  } catch {
    return false;
  }
  if (url.origin !== shown.origin || url.hash) return false;
  const path = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  return path(url.pathname) === path(shown.pathname) && url.search === shown.search;
}
