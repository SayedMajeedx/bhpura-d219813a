import type { Shape } from "../../src/features/gift-card-design/lib/geometry";
import type { Measure } from "../../src/features/gift-card-design/lib/type";

/**
 * Where a card face's words and marks sit, as boxes in millimetres, to tell when two touch: a
 * line of text from its baseline (with the room its letters rise and fall, deeper for Arabic),
 * a logo by its rectangle.
 */
export type Placed = { label: string; x0: number; x1: number; y0: number; y1: number };

/** Mostly Arabic letters (a value like "50.000 د.ب." is mostly digits). */
const arabic = (text: string) => {
  const letters = [...text].filter((c) => /[\p{L}\p{N}]/u.test(c));
  const ar = letters.filter((c) => /\p{Script=Arabic}/u.test(c)).length;
  return ar > letters.length / 2;
};

export function placed(shapes: readonly Shape[], measure: Measure): Placed[] {
  const out: Placed[] = [];
  for (const s of shapes) {
    if (s.kind === "logo") {
      out.push({ label: "logo", x0: s.x, x1: s.x + s.w, y0: s.y, y1: s.y + s.h });
    } else if (s.kind === "text" && s.text.trim()) {
      const width = measure(s.text, s.font);
      const x0 = s.align === "center" ? s.x - width / 2 : s.align === "left" ? s.x : s.x - width;
      const rise = s.font.size * (arabic(s.text) ? 0.9 : 0.74);
      const fall = s.font.size * (arabic(s.text) ? 0.32 : 0.2);
      out.push({ label: s.text, x0, x1: x0 + width, y0: s.y - rise, y1: s.y + fall });
    }
  }
  return out;
}

/** The space between two boxes (negative when they overlap), the larger of the two axes. */
export function gapBetween(a: Placed, b: Placed): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1);
  return Math.max(dx, dy);
}

/** Pairs that sit closer than `logoGap` to the logo, or closer than `textGap` to each other. */
export function clashes(boxes: readonly Placed[], logoGap: number, textGap: number) {
  const found: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const need = a.label === "logo" || b.label === "logo" ? logoGap : textGap;
      const gap = gapBetween(a, b);
      if (gap < need) found.push(`"${a.label}" / "${b.label}" ${gap.toFixed(2)}mm`);
    }
  }
  return found;
}
