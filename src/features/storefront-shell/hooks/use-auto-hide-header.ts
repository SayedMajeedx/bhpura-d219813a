import { useEffect, useState, type RefObject } from "react";
import { HEADER_REVEAL_MS, headerMove } from "@/features/storefront-shell/lib/header-reveal";

/**
 * Whether the store's header is out of view (`headerMove`): it leaves on a scroll down, comes back
 * on a scroll up for `HEADER_REVEAL_MS`, and stays at the top of the page. While the pointer is on
 * it or a control in it has focus it stays, so a menu being used is never taken away; leaving it
 * starts the moment again.
 */
export function useAutoHideHeader(headerRef: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof window === "undefined") return;
    let from = window.scrollY;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let held = false;
    const zone = () => header.offsetHeight;
    const stopTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const leaveLater = () => {
      stopTimer();
      timer = setTimeout(() => {
        if (!held && window.scrollY > zone()) setHidden(true);
      }, HEADER_REVEAL_MS);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const move = headerMove({ y, from, zone: zone() });
        if (move === "keep") return;
        from = y;
        if (move === "show") {
          stopTimer();
          setHidden(false);
        } else if (move === "reveal") {
          setHidden(false);
          if (!held) leaveLater();
        } else if (!held) {
          stopTimer();
          setHidden(true);
        }
      });
    };
    const hold = () => {
      held = true;
      stopTimer();
      setHidden(false);
    };
    const release = () => {
      held = false;
      if (window.scrollY > zone()) leaveLater();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!header.contains(event.relatedTarget as Node | null)) release();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    header.addEventListener("pointerenter", hold);
    header.addEventListener("pointerleave", release);
    header.addEventListener("focusin", hold);
    header.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("scroll", onScroll);
      header.removeEventListener("pointerenter", hold);
      header.removeEventListener("pointerleave", release);
      header.removeEventListener("focusin", hold);
      header.removeEventListener("focusout", onFocusOut);
      if (frame) cancelAnimationFrame(frame);
      stopTimer();
    };
  }, [headerRef]);

  return hidden;
}
