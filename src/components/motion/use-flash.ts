import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A short-lived "done" state ("Added", "Copied"): `flash()` turns it on, and it turns itself
 * off after `ms`. Pressing again restarts the wait.
 */
export function useFlash(ms = 1800): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), ms);
  }, [ms]);
  return [on, flash];
}
