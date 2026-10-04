/**
 * The reveal's colours come from the store's own brand colour, not from the admin
 * theme, so a recording looks like the store (and stays dark and readable even when
 * the admin is in dark mode). Pure: a hex colour in, the stage's background and the
 * text colour that reads on it out.
 */

export type StageColors = {
  /** The stage background: the store's colour. */
  background: string;
  /** The colour of text, rings and confetti on it: white on a dark colour, black on a light one. */
  foreground: "white" | "black";
};

function channels(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The stage colours for a store's brand colour, or null when it is missing or not a
 * hex colour (the stage then uses the theme's own colours).
 */
export function stageColors(color: string | null | undefined): StageColors | null {
  const rgb = color ? channels(color) : null;
  if (!rgb) return null;
  // White text needs a background darker than this to read well.
  return { background: color!.trim(), foreground: luminance(rgb) > 0.4 ? "black" : "white" };
}
