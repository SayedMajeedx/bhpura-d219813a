/**
 * Utilities for View Transitions API in Storefront 2.0.
 * Allows smooth cross-fade and image morphing when navigating between ProductCard and PDP.
 * Gracefully degrades to standard navigation when unsupported or prefers-reduced-motion is active.
 */

export function isViewTransitionSupported(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (typeof (document as any).startViewTransition !== "function") return false;

  // Respect user's motion preferences
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (mediaQuery.matches) return false;

  return true;
}

/**
 * Executes a navigation callback inside document.startViewTransition if supported.
 */
export function navigateWithViewTransition(callback: () => void | Promise<void>): void {
  if (isViewTransitionSupported()) {
    (document as any).startViewTransition(() => {
      return callback();
    });
  } else {
    callback();
  }
}

/**
 * Generates a standard CSS view-transition-name string for product images.
 */
export function getProductTransitionName(productId?: string | null): string {
  if (!productId || typeof productId !== "string") return "product-img-item";
  const cleanId = productId.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!cleanId) return "product-img-item";
  return `product-img-${cleanId}`;
}
