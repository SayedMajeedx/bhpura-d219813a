import { useCallback, useEffect, useRef, useState } from "react";

/** --leave-close-delay + --leave-close in src/styles/motion.css (the row slides out, then its
 * space closes), and a beat. */
const COLLAPSE_MS = 500;

/**
 * A row that leaves a list slides out and folds away first (`t-collapse` with
 * `data-leaving`: the row's own exit, then transitions.dev's card resize on its space), then
 * is removed, so the rows under it glide up instead of jumping.
 * Someone who asked for less motion sees it go at once.
 */
export function useLeavingRows() {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const leave = useCallback((id: string, remove: () => void) => {
    if (timers.current.has(id)) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      remove();
      return;
    }
    setLeaving((current) => new Set(current).add(id));
    timers.current.set(
      id,
      window.setTimeout(() => {
        timers.current.delete(id);
        remove();
        setLeaving((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, COLLAPSE_MS),
    );
  }, []);

  const isLeaving = useCallback((id: string) => leaving.has(id), [leaving]);
  return { isLeaving, leave };
}
