import { useEffect, useState } from "react";
import { keyboardInset } from "@/lib/dialog-layout";

/**
 * How much of the screen a phone's keyboard covers, while `active`: a sheet stands on it so its
 * buttons stay in view, and the field being typed in is brought into view after it opens.
 * A browser with no `visualViewport` (or a laptop) answers 0.
 */
export function useKeyboardInset(active: boolean, container?: HTMLElement | null): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active || typeof window === "undefined" || !window.visualViewport) {
      setInset(0);
      return;
    }
    const viewport = window.visualViewport;
    const measure = () => {
      const next = keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop);
      setInset(next);
      const typing = document.activeElement;
      if (next > 0 && container && typing instanceof HTMLElement && container.contains(typing)) {
        // After the sheet has risen above the keyboard, the field takes the middle of what is left.
        requestAnimationFrame(() => typing.scrollIntoView({ block: "center", inline: "nearest" }));
      }
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, [active, container]);

  return inset;
}
