import { useEffect } from "react";
import { claimBottomBar, releaseBottomBar } from "@/lib/bottom-bar-store";

/**
 * While a page's own bar holds the foot of a phone's screen, the floating dock steps aside (the
 * two would sit one on the other). From `sm` up the bar is part of the page and the dock stays.
 */
export function usePhoneBottomBar(token: string, active = true) {
  useEffect(() => {
    if (!active) return;
    const wide = window.matchMedia?.("(min-width: 640px)");
    const sync = () => (wide?.matches ? releaseBottomBar(token) : claimBottomBar(token));
    sync();
    wide?.addEventListener?.("change", sync);
    return () => {
      wide?.removeEventListener?.("change", sync);
      releaseBottomBar(token);
    };
  }, [token, active]);
}
