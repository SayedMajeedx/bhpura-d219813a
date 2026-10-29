import { type Ref, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ACTIVE_TAB_ATTRIBUTES, ACTIVE_TAB_SELECTORS, PILL_LOOK, pillBox } from "@/lib/motion/pill";

/**
 * The pill that slides to the active tab (transitions.dev's tabs sliding, classes in
 * src/styles/motion.css). Put it first inside the bar, give the bar `t-tabs` and each tab
 * `t-tab`; the active tab is found by its own state (`data-state="active"`, `aria-selected`,
 * `aria-pressed`, `aria-current`, `data-active`), so no prop has to follow it.
 *
 * The pill wears the active tab's own look (its background, shadow, corners and border), and
 * once the pill is there the tab lets its own background go (motion.css), so a bar keeps its
 * design and nothing is drawn twice. Until the pill is measured (a server render) the tab
 * draws itself, as before.
 *
 * The first position, and any after a resize, is written without a transition, so the pill
 * never flies in from the corner.
 */
export function TabsPill({ className, as = "span" }: { className?: string; as?: "span" | "li" }) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const pill = ref.current;
    const bar = pill?.parentElement;
    if (!pill || !bar) return;

    const place = (instant: boolean) => {
      const tab = ACTIVE_TAB_SELECTORS.map((s) => bar.querySelector<HTMLElement>(s)).find(Boolean);
      if (!tab || tab === pill) {
        pill.dataset.ready = "false";
        return;
      }
      const box = pillBox(
        {
          rect: bar.getBoundingClientRect(),
          scrollLeft: bar.scrollLeft,
          scrollTop: bar.scrollTop,
          clientLeft: bar.clientLeft,
          clientTop: bar.clientTop,
        },
        tab.getBoundingClientRect(),
      );
      const first = pill.dataset.ready !== "true";
      if (instant || first) pill.dataset.instant = "true";
      // Read the tab's look with its own background back on (no paint happens in between).
      pill.dataset.ready = "false";
      const look = getComputedStyle(tab);
      for (const key of PILL_LOOK) pill.style[key] = look[key];
      pill.style.transform = `translate(${box.x}px, ${box.y}px)`;
      pill.style.width = `${box.width}px`;
      pill.style.height = `${box.height}px`;
      pill.dataset.ready = "true";
      if (instant || first) {
        void pill.offsetWidth;
        delete pill.dataset.instant;
      }
    };

    place(true);
    // A tab that changes size (a font arriving, a count growing) moves the pill at once.
    const resizes =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place(true));
    const watchSizes = () => {
      if (!resizes) return;
      resizes.disconnect();
      resizes.observe(bar);
      bar.querySelectorAll(":scope > .t-tab").forEach((tab) => resizes.observe(tab));
    };
    watchSizes();

    const changes = new MutationObserver((records) => {
      // A bar whose tabs were replaced (the workspace tabs, on moving to another workspace)
      // watches the new ones: the pill once stayed where the last workspace's tab had been.
      if (records.some((record) => record.type === "childList" && record.target === bar)) {
        watchSizes();
      }
      place(false);
    });
    changes.observe(bar, {
      subtree: true,
      childList: true,
      attributes: true,
      // Every way a bar marks its choice (ACTIVE_TAB_SELECTORS), and a class, for a bar that
      // only restyles its chosen tab. `aria-pressed` was once missing: the switchers' and the
      // product page's pills never moved after the first tap.
      attributeFilter: [...ACTIVE_TAB_ATTRIBUTES, "class"],
    });
    return () => {
      changes.disconnect();
      resizes?.disconnect();
    };
  }, []);

  // In a list (`ul`) the pill is a list item of its own, hidden from reading.
  const Pill = as;
  return (
    <Pill
      ref={ref as Ref<HTMLSpanElement & HTMLLIElement>}
      aria-hidden="true"
      className={cn("t-tabs-pill", className)}
    />
  );
}
