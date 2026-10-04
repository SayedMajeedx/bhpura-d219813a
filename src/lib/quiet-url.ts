/**
 * Changes the address bar without telling the router.
 *
 * TanStack Router wraps `window.history.replaceState` and treats every call as a navigation: it
 * re-reads the location and scrolls the page to the top. A page that only mirrors its own state
 * into the address (the listing's filters) must not do that, or every click on a filter throws
 * the shopper back to the top. This calls the browser's own method, so the address changes and
 * nothing else happens; the history entry keeps its state, so back and forward still work.
 */
export function replaceUrlQuietly(href: string): void {
  if (typeof window === "undefined") return;
  History.prototype.replaceState.call(window.history, window.history.state, "", href);
}
