import type { createRouter } from "@tanstack/react-router";

type ViewTransition = Exclude<
  Parameters<typeof createRouter>[0]["defaultViewTransition"],
  boolean | undefined
>;

/**
 * The router's view transition between pages (the animation review of 2026-11-22: a page
 * swapped in with no motion at all). Only when the path changes, typed `page` so motion.css
 * keeps it to `--motion-quick`; a filter, a tab or a sort written to the address stays still.
 *
 * Only where the browser can type a transition: without types the router would fade every
 * change of the address, filters included. On the server there is no transition.
 */
export function pageViewTransition(
  supportsTypes: boolean = typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("selector(:active-view-transition-type(a))")),
): ViewTransition | false {
  if (!supportsTypes) return false;
  return { types: ({ pathChanged }) => (pathChanged ? ["page"] : false) };
}
