import type { HeroTextPosition, HeroTextTone } from "@/lib/hero-headline";

/**
 * Can the hero's headline be read over its own picture? The settings measure the slide's picture
 * (a video's poster) where the text sits, lay the slide's shade over it and work out the WCAG
 * contrast of the title colour against the lightest part (light text) or the darkest (dark text)
 * of that band. An estimate, said as one: a video moves, and the picture is a still of it.
 */

export type Rgb = readonly [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** A colour written as #rgb, #rrggbb or rgb()/rgba(); null for anything else. */
export function parseCssColor(value: string | null | undefined): Rgb | null {
  const text = value?.trim().toLowerCase() ?? "";
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((d) => d + d)
            .join("")
        : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as unknown as Rgb;
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(text);
  if (rgb) return [1, 2, 3].map((i) => Math.min(255, Number(rgb[i]))) as unknown as Rgb;
  return null;
}

/** WCAG relative luminance. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The rows of the frame the headline covers (0 = top, 1 = bottom). */
export function textBand(position: HeroTextPosition): [number, number] {
  if (position === "top") return [0.08, 0.35];
  if (position === "middle") return [0.38, 0.62];
  return [0.65, 0.92];
}

/** How dark (or light) the shade is at a row of the frame: the gradients `heroScrim` draws. */
export function scrimAlphaAt(
  position: HeroTextPosition,
  strong: number,
  soft: number,
  row: number,
): number {
  if (position === "middle") {
    const fromCentre = Math.abs(row - 0.5) / 0.5;
    return strong * 0.85 + (soft * 0.6 - strong * 0.85) * fromCentre;
  }
  const fromEdge = position === "top" ? row : 1 - row;
  if (fromEdge <= 0.45) return strong + (soft - strong) * (fromEdge / 0.45);
  return soft * (1 - (fromEdge - 0.45) / 0.55);
}

/** The shade at its weakest where the text sits. */
export function shadeInBand(position: HeroTextPosition, strong: number, soft: number): number {
  const [from, to] = textBand(position);
  const rows = [0, 0.25, 0.5, 0.75, 1].map((step) => from + (to - from) * step);
  return Math.min(...rows.map((row) => scrimAlphaAt(position, strong, soft, row)));
}

/**
 * The rows of the picture a frame shows. A picture wider than its frame shows its whole height;
 * a taller one is cut top and bottom around its focal point (`object-position`, 0-100).
 */
export function visibleMediaRows(
  mediaAspect: number,
  frameAspect: number,
  focalY = 50,
): [number, number] {
  if (!(mediaAspect > 0) || !(frameAspect > 0) || frameAspect <= mediaAspect) return [0, 1];
  const shown = mediaAspect / frameAspect;
  const top = (1 - shown) * (Math.min(100, Math.max(0, focalY)) / 100);
  return [top, top + shown];
}

/** The picture's rows behind the text: the frame's band laid over the rows it shows. */
export function mediaBand(band: [number, number], visible: [number, number]): [number, number] {
  const span = visible[1] - visible[0];
  return [visible[0] + band[0] * span, visible[0] + band[1] * span];
}

/** The pixels of an image (RGBA, row by row) between two rows. */
export function bandPixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
  rows: [number, number],
): Rgb[] {
  const first = Math.max(0, Math.floor(rows[0] * height));
  const last = Math.min(height, Math.ceil(rows[1] * height));
  const pixels: Rgb[] = [];
  for (let y = first; y < last; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return pixels;
}

/** The part of the band the text reads worst against: its lightest tenth for light text. */
export function worstBackground(pixels: readonly Rgb[], tone: HeroTextTone): Rgb | null {
  if (pixels.length === 0) return null;
  const sorted = [...pixels].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const at = tone === "dark" ? 0.1 : 0.9;
  return sorted[Math.min(sorted.length - 1, Math.floor(at * sorted.length))];
}

/** A pixel seen through the shade: black under light text, white under dark text. */
export function throughShade(pixel: Rgb, tone: HeroTextTone, alpha: number): Rgb {
  const shade = tone === "dark" ? WHITE : BLACK;
  return pixel.map((value, i) => value * (1 - alpha) + shade[i] * alpha) as unknown as Rgb;
}

export type ContrastVerdict = "good" | "fair" | "low";

/** WCAG: 4.5 for any text; 3 is enough for large text, which a hero headline is. */
export function contrastVerdict(ratio: number): ContrastVerdict {
  if (ratio >= 4.5) return "good";
  if (ratio >= 3) return "fair";
  return "low";
}

export type ContrastInput = {
  pixels: readonly Rgb[];
  tone: HeroTextTone;
  /** The title's colour; light text without one is white. */
  textColor?: string | null;
  position: HeroTextPosition;
  /** The shade strength, 0-100. */
  shade: number;
};

const textRgb = (tone: HeroTextTone, color?: string | null): Rgb =>
  parseCssColor(color) ?? (tone === "dark" ? [20, 20, 20] : WHITE);

/** The headline's contrast over the band it sits on, or null with no picture to measure. */
export function heroTextContrast(input: ContrastInput): number | null {
  const worst = worstBackground(input.pixels, input.tone);
  if (!worst) return null;
  const strong = (input.shade / 100) * 0.95;
  const soft = (input.shade / 100) * 0.45;
  const alpha = shadeInBand(input.position, strong, soft);
  return contrastRatio(
    textRgb(input.tone, input.textColor),
    throughShade(worst, input.tone, alpha),
  );
}

export type ContrastAdvice =
  | { kind: "none" }
  | { kind: "shade"; shade: number }
  | { kind: "tone"; tone: HeroTextTone }
  | { kind: "both"; tone: HeroTextTone; shade: number };

/**
 * What would make low contrast readable: the least shade (up to 80) that reaches 3:1 with the
 * slide's text, else the other kind of text, alone or with more shade.
 */
export function contrastAdvice(input: ContrastInput, target = 3): ContrastAdvice {
  const reaches = (tone: HeroTextTone, shade: number, color?: string | null) =>
    (heroTextContrast({ ...input, tone, shade, textColor: color }) ?? 0) >= target;
  const shades = [];
  for (let shade = Math.ceil(input.shade / 5) * 5; shade <= 80; shade += 5) shades.push(shade);
  const more = shades.find(
    (shade) => shade > input.shade && reaches(input.tone, shade, input.textColor),
  );
  if (more !== undefined) return { kind: "shade", shade: more };
  const other: HeroTextTone = input.tone === "dark" ? "light" : "dark";
  if (reaches(other, input.shade)) return { kind: "tone", tone: other };
  const withShade = shades.find((shade) => reaches(other, shade));
  if (withShade !== undefined) return { kind: "both", tone: other, shade: withShade };
  return { kind: "none" };
}
