/**
 * When the storefront shows that a tapped page is on its way. A page whose code or data is not in
 * the browser yet keeps the old page on screen until it is ready; on a phone that can be seconds,
 * and a shopper who tapped "Gift cards" at the foot of the page saw nothing move (Pura, 2026-11-01:
 * the gift card page's first visit fetched 13 files before it drew). A slim bar at the top of the
 * screen, wherever the page is scrolled, says the tap was taken.
 *
 * Only a move to another page counts: a filter or a sort changes the address's query, not its
 * page, and draws in place. A wait shorter than `NAV_PROGRESS_DELAY_MS` shows nothing, so a page
 * that opens at once never flashes a bar.
 */
export const NAV_PROGRESS_DELAY_MS = 150;

export function navigationWaiting({
  isLoading,
  pathname,
  shownPathname,
}: {
  /** The router is loading what the address asks for. */
  isLoading: boolean;
  /** The page the address asks for. */
  pathname: string;
  /** The page on screen. */
  shownPathname: string | undefined;
}): boolean {
  return isLoading && shownPathname !== undefined && pathname !== shownPathname;
}
