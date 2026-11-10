import type { StoreColours } from "@/features/content-studio/lib/studio-styles";
import { designParts, palette, type CardDesign } from "./design";
import { BLEED, cardSize, type Shape } from "./geometry";
import { placedMark, type CardContent } from "./content";
import {
  clampLines,
  display,
  fitText,
  label,
  languages,
  oneLine,
  textLines,
  wrap,
  type Measure,
} from "./type";

/**
 * The back of a gift message card (`purpose: "message"`): the card a store tucks into a gift
 * order, in the same designs as its gift cards but holding no money. The store's mark hangs from
 * the top, then who it is for, the sender's message set large in the middle, and who it is from at
 * the foot; no value, code or expiry. Centred, in one column, on either orientation.
 */

const WORDS = {
  to: { ar: "إلى", en: "To" },
  from: { ar: "من", en: "From" },
};

function pair(key: keyof typeof WORDS, main: "ar" | "en", second: "ar" | "en" | null): string {
  return second ? `${WORDS[key][main]} · ${WORDS[key][second]}` : WORDS[key][main];
}

const LINE = 1.55;

/**
 * The message as large as the room lets it be (down to a size still easy to read), every line
 * within the width and every line within the room; past that it is cut with an ellipsis.
 */
export function messageFit(
  message: string,
  room: number,
  width: number,
  font: (size: number) => ReturnType<typeof display>,
  measure: Measure,
) {
  for (let size = 6.2; size >= 3.4; size -= 0.2) {
    const f = font(size);
    const lines = wrap(message, f, width, measure);
    const height = (lines.length - 1) * size * LINE + size;
    if (height <= room && lines.every((line) => measure(line, f) <= width))
      return { font: f, lines };
  }
  const f = font(3.4);
  const fits = Math.max(1, Math.floor((room - 3.4) / (3.4 * LINE)) + 1);
  return { font: f, lines: clampLines(wrap(message, f, width, measure), fits) };
}

export function messageBack(
  design: CardDesign,
  content: CardContent,
  colours: StoreColours,
  measure: Measure,
): Shape[] {
  const { tone } = designParts(design.design);
  const pal = palette(tone, colours);
  const { w, h } = cardSize(design.orientation);
  const m = Math.min(w, h) * 0.085;
  const cx = w / 2;
  const width = w - m * 2;
  const { main, second } = languages(design.language, content.primary);
  const shapes: Shape[] = [
    { kind: "rect", x: -BLEED, y: -BLEED, w: w + BLEED * 2, h: h + BLEED * 2, fill: pal.ground },
  ];

  const mark = placedMark(
    content,
    main,
    { x: cx - 13, y: m, w: 26, h: 7 },
    "center",
    pal.ink,
    measure,
    "top",
    width / 2,
  );
  shapes.push(...mark.shapes);
  // A short rule under the mark, in the design's metal.
  const ruleY = Math.max(m + 11, mark.rect.y + mark.rect.h + 4.5);
  shapes.push({
    kind: "path",
    d: `M${cx - 6} ${ruleY}L${cx + 6} ${ruleY}`,
    stroke: pal.metal,
    width: 0.3,
  });

  let top = ruleY + 9;
  const to = content.to?.trim();
  if (to) {
    shapes.push(oneLine(pair("to", main, second), label(main, 2.1), cx, top, "center", pal.soft));
    const name = fitText(to, (s) => display(main, s, content.fonts), width, 7, 4.2, 1, measure);
    top += name.font.size * 1.3 + 1;
    shapes.push(oneLine(name.lines[0] ?? "", name.font, cx, top, "center", pal.ink));
    top += 6;
  }

  // Who it is from stands on the foot margin.
  const from = design.from?.trim();
  let floor = h - m;
  if (from) {
    const fromFont = display(main, 4.2, content.fonts);
    shapes.push(oneLine(from, fromFont, cx, floor, "center", pal.ink));
    const fromLabel = label(main, 2.1);
    shapes.push(
      oneLine(pair("from", main, second), fromLabel, cx, floor - 6.2, "center", pal.soft),
    );
    floor -= 14;
  }

  const message = content.message?.trim();
  if (message) {
    const room = Math.max(floor - top, 12);
    const fitted = messageFit(
      message,
      room,
      width,
      (s) => display(main, s, content.fonts),
      measure,
    );
    const lh = fitted.font.size * LINE;
    // Centred in the room left between the name and the sender.
    const blockH = (fitted.lines.length - 1) * lh + fitted.font.size;
    const first = top + Math.max(0, (room - blockH) / 2) + fitted.font.size * 0.8;
    shapes.push(...textLines(fitted.lines, fitted.font, cx, first, "center", pal.ink, lh));
  }
  return shapes;
}
