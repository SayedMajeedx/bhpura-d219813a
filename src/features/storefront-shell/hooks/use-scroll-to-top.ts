import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  HOLD_TOP_MS,
  SHOPPER_SCROLL_EVENTS,
  linkToShownPage,
  opensAtTop,
  type HistoryMove,
} from "@/features/storefront-shell/lib/scroll-to-top";

/**
 * Every storefront page a shopper opens shows from its top (`scroll-to-top.ts`): after the router
 * draws a new page, the top is asked for again over the next moments, so a glide or a bounce
 * still running from the last page cannot carry it down, until the shopper scrolls themself. A
 * link to the page already shown takes the page back to its top.
 */
export function useScrollToTop() {
  const router = useRouter();

  useEffect(() => {
    let lastMove: HistoryMove | null = null;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let frame = 0;
    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      cancelAnimationFrame(frame);
      for (const type of SHOPPER_SCROLL_EVENTS) removeEventListener(type, stop, true);
    };
    const toTop = () => {
      if (window.scrollY > 0 || window.scrollX !== 0)
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };
    const holdTop = () => {
      stop();
      // A glide still running on a phone is ended by locking the page's scroll for one frame
      // (iOS Safari carries momentum over a scrollTo otherwise).
      // Touch screens only: on a computer it would flicker the scrollbar.
      if (window.matchMedia?.("(pointer: coarse)").matches) {
        const root = document.documentElement;
        const before = root.style.overflow;
        root.style.overflow = "hidden";
        requestAnimationFrame(() => {
          root.style.overflow = before;
        });
      }
      // Whatever the shopper does next is theirs: the top is no longer held.
      for (const type of SHOPPER_SCROLL_EVENTS)
        addEventListener(type, stop, { capture: true, passive: true });
      frame = requestAnimationFrame(toTop);
      timers = HOLD_TOP_MS.map((ms) => setTimeout(toTop, ms));
      timers.push(setTimeout(stop, HOLD_TOP_MS[HOLD_TOP_MS.length - 1] + 50));
    };

    // A shell drawn without a router's history (a test, a preview) holds nothing.
    if (
      typeof router?.history?.subscribe !== "function" ||
      typeof router.subscribe !== "function"
    ) {
      return;
    }
    const offHistory = router.history.subscribe(({ action }) => {
      lastMove = action.type as HistoryMove;
    });
    // A link to the page already shown: the router draws the same page again and puts back the
    // position it kept for it, so the page goes to its top after that (or soon, if it draws
    // nothing).
    let samePage: ReturnType<typeof setTimeout> | null = null;
    const toTopGently = () => {
      if (samePage) clearTimeout(samePage);
      samePage = null;
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, left: 0, behavior: still ? "instant" : "smooth" });
    };
    const offRendered = router.subscribe("onRendered", (event) => {
      if (samePage) {
        lastMove = null;
        requestAnimationFrame(toTopGently);
        return;
      }
      const opens = opensAtTop({
        action: lastMove,
        pathChanged: event.pathChanged,
        hash: event.toLocation.hash,
      });
      lastMove = null;
      if (opens) holdTop();
    });

    const onClick = (event: MouseEvent) => {
      // The router's own link handler takes the click (preventDefault), so that is not asked.
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (
        linkToShownPage(
          {
            href: link.href,
            target: link.getAttribute("target"),
            download: link.hasAttribute("download"),
          },
          event,
          { origin: location.origin, pathname: location.pathname, search: location.search },
        )
      ) {
        stop();
        if (samePage) clearTimeout(samePage);
        samePage = setTimeout(toTopGently, 250);
      }
    };
    document.addEventListener("click", onClick);

    return () => {
      stop();
      if (samePage) clearTimeout(samePage);
      offHistory();
      offRendered();
      document.removeEventListener("click", onClick);
    };
  }, [router]);
}
