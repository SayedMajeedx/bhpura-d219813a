import { useEffect, useRef } from "react";

/**
 * Publishes the height of a bottom-fixed call-to-action bar as
 * `--sf-sticky-cta-h` on the document root, so other bottom-fixed overlays (the
 * cookie-consent banner, toasts) can sit above it instead of covering it.
 *
 * The consent banner used to render on top of the mobile purchase bar, which
 * made "add to cart" untappable for first-time visitors on a phone.
 */
export function useStickyCtaOffset<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const root = document.documentElement;
    const publish = () => {
      const height = el.getBoundingClientRect().height;
      root.style.setProperty("--sf-sticky-cta-h", `${Math.round(height)}px`);
    };

    publish();

    // The bar grows when variant labels wrap, so keep the value current.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    window.addEventListener("resize", publish);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--sf-sticky-cta-h");
    };
  }, []);

  return ref;
}
