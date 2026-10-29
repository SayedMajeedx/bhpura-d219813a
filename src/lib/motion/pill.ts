/**
 * Where a sliding tab's pill sits (transitions.dev's tabs sliding): the active tab's box in
 * its bar's content coordinates, which is the same on an Arabic page and in a bar that
 * scrolls sideways (a scroll container's absolutely placed child scrolls with its content;
 * in a right-to-left bar `scrollLeft` counts down from 0, so adding it still lands on the tab).
 */
export interface PillBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BarMetrics {
  rect: Rect;
  scrollLeft: number;
  scrollTop: number;
  clientLeft: number;
  clientTop: number;
}

export function pillBox(bar: BarMetrics, tab: Rect): PillBox {
  return {
    x: Math.round(tab.left - bar.rect.left - bar.clientLeft + bar.scrollLeft),
    y: Math.round(tab.top - bar.rect.top - bar.clientTop + bar.scrollTop),
    width: Math.round(tab.width),
    height: Math.round(tab.height),
  };
}

/**
 * The tab the pill sits on, a `t-tab` of the bar itself, asked in this order: the bar's own
 * `data-active` (a row of links may have more than one the router calls current), Radix's
 * `data-state="active"`, `aria-selected`, `aria-pressed`, then `aria-current`.
 */
export const ACTIVE_TAB_STATES = [
  ["data-active", "true"],
  ["data-state", "active"],
  ["aria-selected", "true"],
  ["aria-pressed", "true"],
  ["aria-current", "page"],
] as const;

export const ACTIVE_TAB_SELECTORS = ACTIVE_TAB_STATES.map(
  ([name, value]) => `:scope > .t-tab[${name}="${value}"]`,
);

/** The attributes the pill watches: one list with the selectors, so neither can miss one. */
export const ACTIVE_TAB_ATTRIBUTES = ACTIVE_TAB_STATES.map(([name]) => name);

/** What the pill takes from the active tab's own look, so each bar keeps its design. */
export const PILL_LOOK = [
  "backgroundColor",
  "backgroundImage",
  "boxShadow",
  "borderRadius",
  "borderColor",
  "borderStyle",
  "borderWidth",
] as const;
