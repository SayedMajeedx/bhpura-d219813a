import { useCallback, useEffect, useRef, useState } from "react";

/** --resize-dur in src/styles/motion.css, and a beat. */
const COLLAPSE_MS = 320;

/**
 * A row that leaves a list folds away first (transitions.dev's card resize: `t-collapse`
 * with `data-leaving`), then is removed, so the rows under it glide up instead of jumping.
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
