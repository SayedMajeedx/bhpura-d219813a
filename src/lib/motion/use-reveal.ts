import { useEffect, useRef, useState } from "react";

export interface UseRevealOptions {
  threshold?: number;
  rootMargin?: string;
  disabled?: boolean;
}

/**
 * Hook to smoothly reveal elements when scrolled into viewport using IntersectionObserver.
 * Strictly respects prefers-reduced-motion and optional tenant-level motion_enabled setting.
 * Guarantees zero Cumulative Layout Shift (CLS) as space is preserved.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseRevealOptions = {},
) {
  const { threshold = 0.1, rootMargin = "0px 0px -40px 0px", disabled = false } = options;
  const ref = useRef<T | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    // If explicitly disabled or on SSR, immediately reveal without animation
    if (disabled || typeof window === "undefined") {
      setIsRevealed(true);
      return;
    }

    // Check prefers-reduced-motion media query
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setIsRevealed(true);
      if (ref.current) {
        ref.current.classList.add("is-revealed");
        ref.current.setAttribute("data-revealed", "true");
      }
      return;
    }

    const node = ref.current;
    if (!node) return;

    // If IntersectionObserver is not supported, reveal immediately
    if (!("IntersectionObserver" in window)) {
      setIsRevealed(true);
      node.classList.add("is-revealed");
      node.setAttribute("data-revealed", "true");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsRevealed(true);
            entry.target.classList.add("is-revealed");
            entry.target.setAttribute("data-revealed", "true");
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold,
        rootMargin,
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, disabled]);

  return { ref, isRevealed };
}
