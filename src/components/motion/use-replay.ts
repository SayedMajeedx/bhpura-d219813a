import { useCallback, useRef, useState } from "react";

/**
 * A one-shot animation that can be played again: `play()` bumps a count to use as the
 * animated element's `key` (a remount restarts its keyframes) and as "has played" (`> 0`).
 */
export function useReplay(): [number, () => void] {
  const [count, setCount] = useState(0);
  const play = useCallback(() => setCount((n) => n + 1), []);
  return [count, play];
}

/**
 * transitions.dev's error state shake on an element that must not remount (a field keeps its
 * focus): `shake()` takes the class off, forces a reflow and puts it back.
 */
export function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const shake = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("t-shake");
    el.classList.remove("is-shaking");
    void el.offsetWidth;
    el.classList.add("is-shaking");
  }, []);
  return [ref, shake] as const;
}
