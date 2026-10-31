import {
  contrastRatio,
  mixColours,
  readableInk,
} from "@/features/content-studio/lib/studio-styles";
import type { StoreColours } from "@/features/content-studio/lib/studio-styles";
import { cardOccasion, type Ornament } from "./occasions";
import { designParts, palette, type CardDesign, type Palette } from "./design";
import {
  BLEED,
  archPath,
  cardSize,
  ornamentShapes,
  ribbonPath,
  starAndCrossPath,
  type Align,
  type CardFont,
  type Shape,
} from "./geometry";
import { kindLine, storeMark, type CardContent } from "./content";
import {
  alignX,
  body,
  display,
  fitText,
  label,
  languages,
  leading,
  oneLine,
  startOf,
  endOf,
  textLines,
  type Languages,
  type Measure,
} from "./type";

/**
 * A card's front: the greeting, at most one mark, and the store's own mark, laid out by the
 * design's composition on its tone. The amount never shows here (the back says it), as on the
 * cards the owner named. Five compositions:
 *
 * - signature: the store's mark alone on its ground, the greeting small at the foot;
 * - type: the greeting set large, with a lot of paper around it;
 * - photo: the store's own photograph, the greeting on a band of paper below or beside it;
 * - pattern: the star-and-cross pattern tone on tone, the greeting in a pointed arch;
 * - block: the store's colour and the paper as two fields, a ribbon of fine rules at the seam.
 */

type Ctx = {
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

function ground(w: number, h: number, fill: string): Shape {
  return { kind: "rect", x: -BLEED, y: -BLEED, w: w + BLEED * 2, h: h + BLEED * 2, fill };
}

/** The greeting (and, on a card in both languages, the second greeting and the line) as a block. */
function greetingBlock(
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

/** The ornament beside a line start (or centred), in the metallic ink. */
function ornamentAt(ctx: Ctx, align: Align, x: number, y: number, size: number, color: string) {
  const cx = align === "center" ? x : align === "left" ? x + size / 2 : x - size / 2;
  const shift = ctx.ornament === "rule" && align !== "center" ? (align === "left" ? 4 : -4) : 0;
  return ornamentShapes(ctx.ornament, cx + shift, y, size, color);
}

function giftLabel(ctx: Ctx, x: number, y: number, align: Align, color: string): Shape {
  const { main, second } = ctx.langs;
  const words = { ar: "بطاقة هدية", en: "Gift card" };
  const text = second ? `${words[main]} · ${words[second]}` : words[main];
  return oneLine(text, label(main, 2.1), x, y, align, color);
}

function signature(ctx: Ctx): Shape[] {
  const { w, h, m, pal, langs } = ctx;
  const box = ctx.portrait
    ? { w: w * 0.52, h: 24, cy: h * 0.42 }
    : { w: w * 0.38, h: 22, cy: h * 0.42 };
  const shapes: Shape[] = [
    ground(w, h, pal.ground),
    ...storeMark(
      ctx.content,
      langs.main,
      { x: (w - box.w) / 2, y: box.cy - box.h / 2, w: box.w, h: box.h },
      "center",
      pal.ink,
      ctx.measure,
      "middle",
      ctx.w - ctx.m * 2,
    ),
  ];
  const fitted = fitText(
    ctx.greeting[langs.main],
    (size) => ctx.display(langs.main, size),
    w - m * 2,
    5.6,
    3.8,
    1,
    ctx.measure,
  );
  const base = h - m - (langs.second ? 6.5 : 2);
  shapes.push(...textLines(fitted.lines, fitted.font, w / 2, base, "center", pal.ink));
  if (langs.second) {
    shapes.push(
      oneLine(
        ctx.greeting[langs.second],
        body(langs.second, 2.9),
        w / 2,
        h - m,
        "center",
        pal.soft,
      ),
    );
  }
  const markY = base - fitted.font.size - 5;
  shapes.push(
    ...(ctx.ornament === "none" || ctx.ornament === "rule"
      ? [
          {
            kind: "path" as const,
            d: `M${w / 2 - 6} ${markY}L${w / 2 + 6} ${markY}`,
            stroke: pal.metal,
            width: 0.3,
          },
        ]
      : ornamentShapes(ctx.ornament, w / 2, markY - 1, 6, pal.metal)),
  );
  return shapes;
}

function typeLed(ctx: Ctx): Shape[] {
  const { w, h, m, pal, langs } = ctx;
  const align: Align = langs.second ? "center" : startOf(langs.main);
  const x = alignX(align, w, m);
  const shapes: Shape[] = [ground(w, h, pal.ground)];
  shapes.push(...ornamentAt(ctx, align, x, m + 4, 8, pal.metal));
  const block = greetingBlock(ctx, {
    x,
    top: m + (ctx.portrait ? 18 : 13),
    maxW: w - m * 2,
    max: ctx.portrait ? 21 : 17,
    min: 8,
    lines: 3,
    align,
    ink: pal.ink,
    soft: pal.soft,
    lineSize: ctx.portrait ? 4.2 : 3.8,
  });
  shapes.push(...block.shapes);
  const markAlign: Align = langs.second ? "center" : align;
  const markW = 32;
  const markX = markAlign === "center" ? (w - markW) / 2 : markAlign === "left" ? m : w - m - markW;
  shapes.push(
    ...storeMark(
      ctx.content,
      langs.main,
      { x: markX, y: h - m - 8, w: markW, h: 8 },
      markAlign,
      pal.ink,
      ctx.measure,
      "bottom",
      ctx.w - ctx.m * 2,
    ),
  );
  if (!langs.second) {
    shapes.push(
      giftLabel(ctx, alignX(endOf(langs.main), w, m), h - m, endOf(langs.main), pal.metal),
    );
  }
  return shapes;
}

function photo(ctx: Ctx): Shape[] {
  const { w, h, m, pal, langs, content } = ctx;
  const shapes: Shape[] = [ground(w, h, pal.ground)];
  if (ctx.portrait) {
    const seam = h * 0.6;
    if (content.photo) {
      shapes.push({
        kind: "image",
        href: content.photo,
        x: -BLEED,
        y: -BLEED,
        w: w + BLEED * 2,
        h: seam + BLEED,
      });
    }
    const block = greetingBlock(ctx, {
      x: w / 2,
      top: seam + 8,
      maxW: w - m * 2,
      max: 8.5,
      min: 5,
      lines: 2,
      align: "center",
      ink: pal.ink,
      soft: pal.soft,
    });
    shapes.push(...block.shapes);
    shapes.push(
      ...storeMark(
        content,
        langs.main,
        { x: (w - 28) / 2, y: h - m - 7, w: 28, h: 7 },
        "center",
        pal.ink,
        ctx.measure,
        "bottom",
        ctx.w - ctx.m * 2,
      ),
    );
    return shapes;
  }
  const seam = w * 0.5;
  if (content.photo) {
    shapes.push({
      kind: "image",
      href: content.photo,
      x: -BLEED,
      y: -BLEED,
      w: seam + BLEED,
      h: h + BLEED * 2,
    });
  }
  const colW = w - seam - m * 2;
  const cx = seam + m + colW / 2;
  const block = greetingBlock(ctx, {
    x: cx,
    top: m + 14,
    maxW: colW,
    max: 8.5,
    min: 5,
    lines: 3,
    align: "center",
    ink: pal.ink,
    soft: pal.soft,
  });
  shapes.push(...block.shapes);
  shapes.push(
    ...storeMark(
      content,
      langs.main,
      { x: cx - 13, y: h - m - 7, w: 26, h: 7 },
      "center",
      pal.ink,
      ctx.measure,
      "bottom",
      ctx.w - ctx.m * 2,
    ),
  );
  return shapes;
}

function pattern(ctx: Ctx): Shape[] {
  const { w, h, m, pal, langs } = ctx;
  const shapes: Shape[] = [
    ground(w, h, pal.ground),
    {
      kind: "path",
      d: starAndCrossPath(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2, ctx.portrait ? 13 : 12),
      stroke: pal.pattern,
      width: 0.22,
    },
  ];
  const arch = ctx.portrait
    ? { w: w * 0.64, h: h * 0.62, y: h * 0.12 }
    : { w: w * 0.4, h: h * 0.8, y: h * 0.08 };
  const ax = (w - arch.w) / 2;
  shapes.push(
    {
      kind: "path",
      d: archPath(ax, arch.y, arch.w, arch.h),
      fill: pal.ground,
      stroke: pal.metal,
      width: 0.35,
    },
    {
      kind: "path",
      d: archPath(ax + 1.8, arch.y + 2.6, arch.w - 3.6, arch.h - 4.4),
      stroke: pal.metal,
      width: 0.15,
    },
  );
  const mark: Ornament = ctx.ornament === "none" || ctx.ornament === "rule" ? "star" : ctx.ornament;
  const opts = {
    x: w / 2,
    maxW: arch.w - 12,
    max: ctx.portrait ? 10 : 8.5,
    min: 4.6,
    lines: 3,
    align: "center" as const,
    ink: pal.ink,
    soft: pal.soft,
  };
  // The mark and the words sit together at the middle of the arch's body, below its point.
  const height = greetingBlock(ctx, { ...opts, top: 0 }).bottom;
  const markRoom = 13;
  const bodyTop = arch.y + arch.w * 0.32;
  const top = bodyTop + (arch.y + arch.h - bodyTop - height - markRoom) / 2 + markRoom;
  shapes.push(...ornamentShapes(mark, w / 2, top - 7, mark === "star" ? 5 : 8, pal.metal));
  shapes.push(...greetingBlock(ctx, { ...opts, top }).shapes);
  if (ctx.portrait) {
    shapes.push(
      ...storeMark(
        ctx.content,
        langs.main,
        { x: (w - 30) / 2, y: h - m - 8, w: 30, h: 8 },
        "center",
        pal.ink,
        ctx.measure,
        "bottom",
        ctx.w - ctx.m * 2,
      ),
    );
  } else {
    const align = startOf(langs.main);
    shapes.push(
      ...storeMark(
        ctx.content,
        langs.main,
        { x: align === "left" ? m : w - m - 24, y: h - m - 7, w: 24, h: 7 },
        align,
        pal.ink,
        ctx.measure,
        "bottom",
        ctx.w - ctx.m * 2,
      ),
    );
  }
  return shapes;
}

function block(ctx: Ctx, tone: string): Shape[] {
  const { w, h, m, pal, langs } = ctx;
  const paper =
    tone === "brand" ? palette("cream", { accent: pal.accent, background: null, text: null }) : pal;
  let field = pal.accent;
  // A store colour too near the paper (a dark one on black) gives way to the paper's own ink.
  if (contrastRatio(field, paper.ground) < 1.6) field = paper.ink;
  const fieldInk = readableInk(field, ["#F3EEE6", "#171615"], "#F3EEE6");
  const fieldSoft = mixColours(fieldInk, field, 0.3);
  const align: Align = langs.second ? "center" : startOf(langs.main);
  const shapes: Shape[] = [ground(w, h, paper.ground)];
  if (ctx.portrait) {
    const seam = h * 0.58;
    shapes.push(
      { kind: "rect", x: -BLEED, y: -BLEED, w: w + BLEED * 2, h: seam + BLEED, fill: field },
      {
        kind: "path",
        d: ribbonPath(-BLEED, w + BLEED, seam + 2.2, 4, 1.1, false),
        stroke: paper.metal,
        width: 0.3,
      },
      ...ornamentAt(ctx, align, alignX(align, w, m), m + 4, 7, fieldInk),
    );
    const fitted = fitText(
      ctx.greeting[langs.main],
      (s) => ctx.display(langs.main, s),
      w - m * 2,
      13,
      6.5,
      3,
      ctx.measure,
    );
    const lh = leading(fitted.font);
    const last = seam - 8;
    shapes.push(
      ...textLines(
        fitted.lines,
        fitted.font,
        alignX(align, w, m),
        last - (fitted.lines.length - 1) * lh,
        align,
        fieldInk,
      ),
    );
    let y = seam + 15;
    if (langs.second) {
      shapes.push(
        oneLine(
          ctx.greeting[langs.second],
          ctx.display(langs.second, 4.6),
          alignX(align, w, m),
          y,
          align,
          paper.ink,
        ),
      );
      y += 7;
    }
    if (ctx.line) {
      const font = body(langs.main, 3.3);
      const lines = fitText(
        ctx.line[langs.main],
        () => font,
        w - m * 2,
        3.3,
        3.3,
        2,
        ctx.measure,
      ).lines;
      shapes.push(...textLines(lines, font, alignX(align, w, m), y, align, paper.soft));
    }
    const markW = 30;
    const markX = align === "center" ? (w - markW) / 2 : align === "left" ? m : w - m - markW;
    shapes.push(
      ...storeMark(
        ctx.content,
        langs.main,
        { x: markX, y: h - m - 8, w: markW, h: 8 },
        align,
        paper.ink,
        ctx.measure,
        "bottom",
        ctx.w - ctx.m * 2,
      ),
    );
    return shapes;
  }
  const seam = w * 0.58;
  const fieldOnLeft = langs.main === "en";
  const fx = fieldOnLeft ? -BLEED : w - seam;
  shapes.push({ kind: "rect", x: fx, y: -BLEED, w: seam + BLEED, h: h + BLEED * 2, fill: field });
  const ribbonAt = fieldOnLeft ? seam + 2.2 : w - seam - 2.2 - 3.3;
  shapes.push({
    kind: "path",
    d: ribbonPath(-BLEED, h + BLEED, ribbonAt, 4, 1.1, true),
    stroke: paper.metal,
    width: 0.3,
  });
  const fieldLeft = fieldOnLeft ? 0 : w - seam;
  const inner = { x0: fieldLeft + m, x1: fieldLeft + seam - m };
  const fAlign: Align = langs.second ? "center" : startOf(langs.main);
  const fx0 =
    fAlign === "center" ? (inner.x0 + inner.x1) / 2 : fAlign === "left" ? inner.x0 : inner.x1;
  shapes.push(...ornamentAt(ctx, fAlign, fx0, m + 4, 7, fieldInk));
  const fitted = fitText(
    ctx.greeting[langs.main],
    (s) => ctx.display(langs.main, s),
    inner.x1 - inner.x0,
    11,
    6,
    3,
    ctx.measure,
  );
  const lh = leading(fitted.font);
  shapes.push(
    ...textLines(
      fitted.lines,
      fitted.font,
      fx0,
      h - m - 2 - (fitted.lines.length - 1) * lh - (langs.second ? 7 : 0),
      fAlign,
      fieldInk,
    ),
  );
  if (langs.second) {
    shapes.push(
      oneLine(
        ctx.greeting[langs.second],
        ctx.display(langs.second, 4.2),
        fx0,
        h - m - 1,
        fAlign,
        fieldSoft,
      ),
    );
  }
  const paperX0 = fieldOnLeft ? seam + 6 : m;
  const paperX1 = fieldOnLeft ? w - m : w - seam - 6;
  const cx = (paperX0 + paperX1) / 2;
  if (ctx.line) {
    const font = body(langs.main, 3.1);
    const lines = fitText(
      ctx.line[langs.main],
      () => font,
      paperX1 - paperX0,
      3.1,
      3.1,
      3,
      ctx.measure,
    ).lines;
    const top = h - m - 15 - (lines.length - 1) * leading(font);
    shapes.push(...textLines(lines, font, cx, top, "center", paper.soft));
  }
  shapes.push(
    ...storeMark(
      ctx.content,
      langs.main,
      { x: cx - 14, y: h - m - 8, w: 28, h: 8 },
      "center",
      paper.ink,
      ctx.measure,
      "bottom",
      ctx.w - ctx.m * 2,
    ),
  );
  return shapes;
}

export function cardFront(
  design: CardDesign,
  content: CardContent,
  colours: StoreColours,
  measure: Measure,
): Shape[] {
  const { composition, tone } = designParts(design.design);
  const { w, h } = cardSize(design.orientation);
  const occasion = cardOccasion(design.occasion);
  const ctx: Ctx = {
    w,
    h,
    m: Math.min(w, h) * 0.085,
    pal: palette(tone, colours),
    langs: languages(design.language, content.primary),
    content,
    measure,
    ornament: occasion.ornament,
    greeting: occasion.greeting,
    line: occasion.line ?? (occasion.id === "gift" ? kindLine(content.kind) : null),
    portrait: design.orientation === "portrait",
    display: (lang, size) => display(lang, size, content.fonts),
  };
  if (composition === "signature") return signature(ctx);
  if (composition === "type") return typeLed(ctx);
  if (composition === "photo") return photo(ctx);
  if (composition === "pattern") return pattern(ctx);
  return block(ctx, tone);
}
