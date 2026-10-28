import { useEffect, useState } from "react";

/** --acc-collapse in src/styles/motion.css, and a beat. */
const FOLD_MS = 280;

/**
 * A fold whose body is mounted only while it is open (a settings form) can still grow and fold
 * (transitions.dev's accordion, `t-acc`): the body is mounted at once when opened and drawn
 * closed for one frame, then open, so it grows; when closed it folds, then unmounts.
 * `mounted` says whether to render the body, `shown` is its `data-open`. A fold drawn open
 * does not animate on first paint; someone who asked for less motion sees it at once.
 */
export function useDisclosure(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (open) {
      setMounted(true);
      if (reduced) {
        setShown(true);
        return;
      }
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    setShown(false);
    if (reduced) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), FOLD_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { mounted: mounted || open, shown: shown && open };
}
