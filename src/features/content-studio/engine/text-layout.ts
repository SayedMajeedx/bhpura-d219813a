import { containsArabic } from "@/features/content-studio/lib/studio-content";

/** The width a piece of text takes at the current font (a canvas measureText). */
export type Measure = (text: string) => number;

/** Right to left when the text holds Arabic letters, else left to right. */
export function textDirection(text: string): "rtl" | "ltr" {
  return containsArabic(text) ? "rtl" : "ltr";
}

/**
 * Breaks text into lines no wider than `maxWidth`, only at spaces and line
 * breaks. A word is never split between its letters (that would break joined
 * Arabic script), so a single word wider than the line stays whole.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measure(candidate) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * The largest font size between `min` and `max` at which the text wraps into
 * at most `maxLines` lines within `maxWidth`, with those lines. When even
 * `min` needs more lines, the lines at `min` are returned (the caller clips).
 */
export function fitText(
  text: string,
  {
    maxWidth,
    maxLines,
    min,
    max,
    step = 2,
  }: { maxWidth: number; maxLines: number; min: number; max: number; step?: number },
  measureAt: (size: number) => Measure,
): { size: number; lines: string[] } {
  for (let size = max; size >= min; size -= step) {
    const lines = wrapText(text, maxWidth, measureAt(size));
    const widest = Math.max(0, ...lines.map((line) => measureAt(size)(line)));
    if (lines.length <= maxLines && widest <= maxWidth) return { size, lines };
  }
  return { size: min, lines: wrapText(text, maxWidth, measureAt(min)) };
}
