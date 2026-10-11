/**
 * Text that is cut short on screen, and where to show it in full. Pure: the component
 * `TruncationReveal` reads the boxes and styles from the page and asks these.
 */

export type TextBox = {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
};

export type TextStyle = {
  textOverflow: string;
  overflowX: string;
  /** `-webkit-line-clamp`: a number of lines, or "none". */
  lineClamp: string;
};

/**
 * Whether an element shows less than its text: one line ended with an ellipsis, or a block
 * clamped to a few lines, and in both cases more text than the box holds. A box that merely
 * could cut its text, but fits it, is not cut.
 */
export function isCutShort(box: TextBox, style: TextStyle): boolean {
  const endsWithEllipsis =
    style.textOverflow === "ellipsis" &&
    style.overflowX !== "visible" &&
    box.scrollWidth > box.clientWidth + 1;
  const clamped =
    style.lineClamp !== "" && style.lineClamp !== "none" && box.scrollHeight > box.clientHeight + 1;
  return endsWithEllipsis || clamped;
}

export type Edges = { left: number; top: number; right: number; bottom: number };

/**
 * Where the full text goes: above the cut text and centred on it, below when there is no room
 * above, and always inside the screen with a small margin.
 */
export function revealPosition(
  anchor: Edges,
  bubble: { width: number; height: number },
  screen: { width: number; height: number },
  gap = 6,
  margin = 8,
): { left: number; top: number } {
  const centred = (anchor.left + anchor.right) / 2 - bubble.width / 2;
  const left = Math.max(margin, Math.min(centred, screen.width - bubble.width - margin));
  const above = anchor.top - gap - bubble.height;
  const below = anchor.bottom + gap;
  const top =
    above >= margin
      ? above
      : Math.max(margin, Math.min(below, screen.height - bubble.height - margin));
  return { left: Math.round(left), top: Math.round(top) };
}
