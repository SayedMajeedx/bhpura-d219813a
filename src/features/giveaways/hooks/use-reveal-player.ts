import { useCallback, useEffect, useState } from "react";
import {
  advance,
  begin,
  delayFor,
  READY,
  skip as skipAhead,
  type RevealPlan,
  type RevealState,
} from "../lib/reveal";

/**
 * Plays the reveal: holds the state, and moves it on after each state's time. A
 * person can start, skip ahead or go back to the start; every change clears the
 * pending timer, so a skip never fires a stale step.
 */
export function useRevealPlayer(plan: RevealPlan) {
  const [state, setState] = useState<RevealState>(READY);

  useEffect(() => {
    const delay = delayFor(state, plan);
    if (delay === null) return;
    const timer = setTimeout(() => setState((current) => advance(current, plan)), delay);
    return () => clearTimeout(timer);
  }, [state, plan]);

  const start = useCallback(() => setState(begin()), []);
  const skip = useCallback(() => setState((current) => skipAhead(current, plan)), [plan]);
  const reset = useCallback(() => setState(READY), []);

  return { state, start, skip, reset };
}
