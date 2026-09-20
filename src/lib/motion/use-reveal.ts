import { useEffect, useRef, useState } from "react";

export interface UseRevealOptions {
  threshold?: number;
  rootMargin?: string;
  disabled?: boolean;
}

type RevealListener = (isIntersecting: boolean) => void;

interface ObserverPoolEntry {
  observer: IntersectionObserver;
  listeners: Map<Element, RevealListener>;
}

const observerPool = new Map<string, ObserverPoolEntry>();

function getPooledObserver(threshold: number, rootMargin: string): ObserverPoolEntry {
  const key = `${threshold}:${rootMargin}`;
  let poolEntry = observerPool.get(key);

  if (!poolEntry) {
    const listeners = new Map<Element, RevealListener>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const listener = listeners.get(entry.target);
            if (listener) {
              listener(true);
              listeners.delete(entry.target);
              observer.unobserve(entry.target);
            }
          }
        }
      },
      { threshold, rootMargin },
    );

    poolEntry = { observer, listeners };
    observerPool.set(key, poolEntry);
  }

  return poolEntry;
}

/**
 * Hook to smoothly reveal elements when scrolled into viewport using a pooled IntersectionObserver.
 * Strictly respects prefers-reduced-motion and optional tenant-level motion_enabled setting.
 * Guarantees zero Cumulative Layout Shift (CLS) as space is preserved.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options: UseRevealOptions = {}) {
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

    const poolEntry = getPooledObserver(threshold, rootMargin);
    const onIntersect: RevealListener = () => {
      setIsRevealed(true);
      node.classList.add("is-revealed");
      node.setAttribute("data-revealed", "true");
    };

    poolEntry.listeners.set(node, onIntersect);
    poolEntry.observer.observe(node);

    return () => {
      poolEntry.listeners.delete(node);
      poolEntry.observer.unobserve(node);
    };
  }, [threshold, rootMargin, disabled]);

  return { ref, isRevealed };
}
