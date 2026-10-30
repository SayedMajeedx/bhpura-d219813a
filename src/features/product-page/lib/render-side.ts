/**
 * Whether the product page is being drawn on the server (the first visit, and every crawler) or
 * in the shopper's browser (a tap from a card). On the server the loader waits for everything the
 * page's Google data names (its reviews' stars, the return policy) and the rails below the fold;
 * in the browser it waits for the product alone, and those arrive while the shopper looks at it.
 */
export function rendersOnServer(): boolean {
  return typeof window === "undefined";
}
