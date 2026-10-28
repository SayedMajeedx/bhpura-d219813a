import { useRef, type RefObject } from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(Flip, useGSAP);

/**
 * An order that moves to another column of the board travels there (GSAP Flip), instead of
 * vanishing from one column and appearing in the next; a card that arrives fades in.
 *
 * The cards' places are read while React renders with new orders, before it changes the page
 * (the old places are still drawn), and played from after it has. A card is matched across
 * columns by its `data-flip-id`, since moving to another list remounts it. Someone who asked
 * for less motion sees the board change at once. Loaded with the board only.
 */
export function useBoardFlip(board: RefObject<HTMLElement | null>, orders: unknown) {
  const seen = useRef(orders);
  const before = useRef<Flip.FlipState | null>(null);

  if (seen.current !== orders) {
    seen.current = orders;
    const cards = board.current?.querySelectorAll("[data-flip-id]");
    before.current = cards && cards.length > 0 ? Flip.getState(cards) : null;
  }

  useGSAP(
    () => {
      const state = before.current;
      before.current = null;
      if (!state || !board.current) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      Flip.from(state, {
        targets: board.current.querySelectorAll("[data-flip-id]"),
        duration: 0.45,
        ease: "expo.out",
        // Cards whose order arrived on the board come in quietly.
        onEnter: (cards) =>
          gsap.fromTo(
            cards,
            { opacity: 0, scale: 0.96 },
            { opacity: 1, scale: 1, duration: 0.3, ease: "power2.out" },
          ),
      });
    },
    { dependencies: [orders], scope: board },
  );
}
