/**
 * Opening the store's cart drawer from anywhere on a page (after "Add to cart", the product page's
 * button and the phone's buy bar). The header mounts a drawer for phones and one for wide screens;
 * only the one whose button can be seen answers (`triggerShown`), so a single drawer opens. The
 * caller learns whether one did: a page with no drawer (a catalog store) says "added" its own way.
 */
const OPEN_CART = "boutq:open-cart";

/** Asks the page's cart drawer to open; true when one did. */
export function openCartDrawer(): boolean {
  if (typeof window === "undefined") return false;
  const request = new CustomEvent(OPEN_CART, { cancelable: true });
  window.dispatchEvent(request);
  return request.defaultPrevented;
}

/** A drawer listens: `open` returns true when it opened. Returns the way to stop listening. */
export function listenForCartOpen(open: () => boolean): () => void {
  const handle = (event: Event) => {
    if (!event.defaultPrevented && open()) event.preventDefault();
  };
  window.addEventListener(OPEN_CART, handle);
  return () => window.removeEventListener(OPEN_CART, handle);
}

/** Whether an element is laid out on the page (not inside something hidden, as a phone's header is on a wide screen). */
export function triggerShown(element: Element | null): boolean {
  return Boolean(element && element.getClientRects().length > 0);
}
