/**
 * The one look of every admin tab bar (the owner's request of 2026-11-23: each page drew its own
 * bar, dark pills on one, outlined chips on another, and the size guide's sat off-centre): a light
 * track, the chosen tab raised in white, the others in muted text. A bar writes only its layout
 * (full width, equal columns), never a height, a padding or a colour of its own.
 *
 * - The track sets no height: its tabs give it, so the chosen tab is always centred in it (a
 *   track fixed at 40px around 36px tabs, a border and a padding left the size guide's flush with
 *   the bottom).
 * - The track scrolls sideways when its tabs do not fit, with no scrollbar; it is 44px tall on a
 *   touch screen, as a scrolling row clips the taps' larger invisible boxes (mobile-native.css).
 * - Keyboard focus is an outline inside the tab: a ring drawn outside it was cut by the track's
 *   edge (the orders' and the products' filters), and the sliding fill (`TabsPill`) copies a tab's
 *   shadow, so a focus ring drawn as one stayed on the fill after focus moved on.
 *
 * Used by `TabsList` / `TabsTrigger` (src/components/ui/tabs.tsx) and the bars built by hand
 * (the orders' and the products' filters, the workspace tabs, the dashboard's period, the orders'
 * list or board, the discounts' kinds). Put `TabsPill` first in a track built by hand.
 */
export const SEGMENT_TRACK =
  "t-tabs relative inline-flex max-w-full items-center gap-1 overflow-x-auto scrollbar-none rounded-xl border border-border-subtle bg-muted/60 p-1 text-muted-foreground";

export const SEGMENT_TAB =
  "t-tab inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors duration-(--motion-quick) touch-manipulation select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11";

/** The chosen tab: raised in white. */
export const SEGMENT_TAB_ACTIVE = "bg-background text-foreground shadow-xs";

/** Any other tab. */
export const SEGMENT_TAB_IDLE = "text-muted-foreground hover:text-foreground";

/**
 * A tab whose view holds work waiting on the team (the orders that need action): its label in the
 * ink of a chosen tab and its count in solid amber. Amber text on the light track read at under
 * 4.5:1, and `warning-foreground` is the text for a solid amber ground, near white on the track.
 */
export const SEGMENT_TAB_URGENT = "text-foreground";

/** A count beside a tab's label. */
export const SEGMENT_COUNT =
  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums";
export const SEGMENT_COUNT_ACTIVE = "bg-muted text-foreground";
export const SEGMENT_COUNT_IDLE = "bg-background/80 text-muted-foreground";
export const SEGMENT_COUNT_URGENT = "bg-warning text-warning-foreground";

/** A tab's classes for its state. */
export function segmentTab(active: boolean, urgent = false): string {
  return `${SEGMENT_TAB} ${active ? SEGMENT_TAB_ACTIVE : urgent ? SEGMENT_TAB_URGENT : SEGMENT_TAB_IDLE}`;
}

/** A count's classes for its tab's state. */
export function segmentCount(active: boolean, urgent = false): string {
  return `${SEGMENT_COUNT} ${active ? SEGMENT_COUNT_ACTIVE : urgent ? SEGMENT_COUNT_URGENT : SEGMENT_COUNT_IDLE}`;
}
