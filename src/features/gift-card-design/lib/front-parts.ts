import type { Ornament } from "./occasions";
import type { Palette } from "./design";
import { BLEED, ornamentShapes, type Align, type CardFont, type Shape } from "./geometry";
import type { CardContent } from "./content";
import {
  body,
  fitText,
  label,
  leading,
  oneLine,
  textLines,
  type Languages,
  type Measure,
} from "./type";

/**
 * The parts every composition of a card's front is built from (`front.ts`): the ground, the
 * greeting block (fitted to the room above the store's mark), the ornament and the "gift card"
 * label.
 */

export type Ctx = {
  w: number;
  h: number;
  m: number;
  pal: Palette;
  langs: Languages;
  content: CardContent;
  measure: Measure;
  ornament: Ornament;
  greeting: { ar: string; en: string };
  line: { ar: string; en: string } | null;
  portrait: boolean;
  /** The display face, in the store's own card font when it uploaded one. */
  display: (lang: "ar" | "en", size: number) => CardFont;
};

export function ground(w: number, h: number, fill: string): Shape {
  return { kind: "rect", x: -BLEED, y: -BLEED, w: w + BLEED * 2, h: h + BLEED * 2, fill };
}

/** The greeting (and, on a card in both languages, the second greeting and the line) as a block. */
export function greetingBlock(
  ctx: Ctx,
  opts: {
    x: number;
    top: number;
    maxW: number;
    max: number;
    min: number;
    lines: number;
    align: Align;
    ink: string;
    soft: string;
    /** The quiet line's size (it grows with a larger greeting). */
    lineSize?: number;
  },
): { shapes: Shape[]; bottom: number } {
  const { main, second } = ctx.langs;
  const fitted = fitText(
    ctx.greeting[main],
    (size) => ctx.display(main, size),
    opts.maxW,
    opts.max,
    opts.min,
    opts.lines,
    ctx.measure,
  );
  const lh = leading(fitted.font);
  const first = opts.top + fitted.font.size * (main === "ar" ? 0.95 : 0.78);
  const shapes = textLines(fitted.lines, fitted.font, opts.x, first, opts.align, opts.ink);
  let bottom = first + (fitted.lines.length - 1) * lh;
  // The space under the greeting grows with it, as the descenders of a large line do.
  const gap = Math.max(fitted.font.size * 0.5, 3.5);
  if (second) {
    const size = Math.max(fitted.font.size * 0.42, 3.6);
    const font = ctx.display(second, size);
    bottom += gap + size;
    shapes.push(oneLine(ctx.greeting[second], font, opts.x, bottom, opts.align, opts.soft));
  }
  if (ctx.line) {
    const size = opts.lineSize ?? (ctx.portrait ? 3.6 : 3.4);
    const font = body(main, size);
    const lines = fitText(ctx.line[main], () => font, opts.maxW, size, size, 2, ctx.measure).lines;
    bottom += gap + size;
    shapes.push(...textLines(lines, font, opts.x, bottom, opts.align, opts.soft));
    bottom += (lines.length - 1) * leading(font);
  }
  return { shapes, bottom };
}

/** The room kept between the words and the store's mark under them. */
export const MARK_GAP = 3.5;

/**
 * The greeting block at its largest that still ends clear of the mark under it (`limit`): a
 * smaller greeting first, then without its quiet line. A logo the store set large takes its room.
 */
export function greetingAbove(
  ctx: Ctx,
  opts: Parameters<typeof greetingBlock>[1],
  limit: number,
): ReturnType<typeof greetingBlock> {
  // What the last line's letters fall below its baseline.
  const clear = (b: { bottom: number }) => b.bottom + 1.6 <= limit;
  for (let max = opts.max; max > opts.min; max -= 0.5) {
    const block = greetingBlock(ctx, { ...opts, max });
    if (clear(block)) return block;
  }
  const smallest = greetingBlock(ctx, { ...opts, max: opts.min });
  return clear(smallest)
    ? smallest
    : greetingBlock({ ...ctx, line: null }, { ...opts, max: opts.min });
}

/** The ornament beside a line start (or centred), in the metallic ink. */
export function ornamentAt(
  ctx: Ctx,
  align: Align,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const cx = align === "center" ? x : align === "left" ? x + size / 2 : x - size / 2;
  const shift = ctx.ornament === "rule" && align !== "center" ? (align === "left" ? 4 : -4) : 0;
  return ornamentShapes(ctx.ornament, cx + shift, y, size, color);
}

export function giftLabel(ctx: Ctx, x: number, y: number, align: Align, color: string): Shape {
  const { main, second } = ctx.langs;
  // A gift message card holds no money, so it never calls itself a gift card.
  const words =
    ctx.content.purpose === "message"
      ? { ar: "إهداء", en: "With love" }
      : { ar: "بطاقة هدية", en: "Gift card" };
  const text = second ? `${words[main]} · ${words[second]}` : words[main];
  return oneLine(text, label(main, 2.1), x, y, align, color);
}
