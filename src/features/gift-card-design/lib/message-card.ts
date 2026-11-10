import type { StoreColours } from "@/features/content-studio/lib/studio-styles";
import { designParts, palette, type CardDesign, type Palette } from "./design";
import { BLEED, cardSize, doubleFrame, ornamentShapes, starPolygon, type Shape } from "./geometry";
import { placedMark, type CardContent } from "./content";
import {
  body,
  clampLines,
  display,
  label,
  languages,
  oneLine,
  textLines,
  wrap,
  type Measure,
} from "./type";

/**
 * A gift message card (`purpose: "message"`): the card a store tucks into a gift order, in its
 * gift cards' tones but holding no money, as the owner asked on 2026-11-10. Both faces wear the
 * same quiet frame, two hairlines in the design's metal with a small eight-point star in each
 * corner (lines and small marks only, so a shop's printer prints it clean, as every card is).
 * The front is the store's: its mark large in the middle (drawn as vector, so an SVG logo prints
 * sharp at any size), a short rule under it, and its number and Instagram at the foot. The back
 * is the sender's: who it is for, the message as large as its room lets it be, who it is from.
 */

/** Where the frame sits inside the trim: clear of the edge a home printer cannot reach. */
export const FRAME_INSET = 5.5;
/** Where the words start inside the frame. */
const INSIDE = FRAME_INSET + 6.5;
const LINE = 1.55;

/** How large the message may be set, by the staff's choice: automatic fills the room. */
export type MessageSize = "small" | "auto" | "large";
export const MESSAGE_SIZES: readonly MessageSize[] = ["small", "auto", "large"];
/** The largest size (mm) each choice sets the message at; the room can always ask for less. */
const MESSAGE_MAX: Record<MessageSize, number> = { small: 6.5, auto: 11, large: 15 };
/** The smallest size the message is set at before it is cut short. */
const MESSAGE_MIN = 3.4;

const WORDS = {
  to: { ar: "إلى", en: "To" },
  from: { ar: "من", en: "From" },
};

function pair(key: keyof typeof WORDS, main: "ar" | "en", second: "ar" | "en" | null): string {
  return second ? `${WORDS[key][main]} · ${WORDS[key][second]}` : WORDS[key][main];
}

/** The paper, the double frame and a small star in each corner of it. */
function framed(w: number, h: number, pal: Palette): Shape[] {
  const at = FRAME_INSET + 0.55;
  const corners = [
    [at, at],
    [w - at, at],
    [at, h - at],
    [w - at, h - at],
  ] as const;
  return [
    { kind: "rect", x: -BLEED, y: -BLEED, w: w + BLEED * 2, h: h + BLEED * 2, fill: pal.ground },
    ...doubleFrame(w, h, FRAME_INSET, pal.metal),
    // Each star sits on the corner and hides the lines' meeting under a patch of paper.
    ...corners.flatMap(([x, y]): Shape[] => [
      { kind: "rect", x: x - 2.2, y: y - 2.2, w: 4.4, h: 4.4, fill: pal.ground },
      { kind: "path", d: starPolygon(x, y, 1.7), fill: pal.metal },
    ]),
  ];
}

/**
 * Lines of even length: the same number of lines as the widest wrap gives, at the narrowest width
 * that still holds them, so a short message reads as two or three balanced lines (as written on a
 * card by hand), never one long line over a short last word.
 */
export function balancedLines(
  text: string,
  font: ReturnType<typeof display>,
  width: number,
  measure: Measure,
): string[] {
  const lines = wrap(text, font, width, measure);
  if (lines.length < 2) return lines;
  const fits = (w: number) => {
    const tried = wrap(text, font, w, measure);
    return tried.length === lines.length && tried.every((line) => measure(line, font) <= w);
  };
  let lo = width * 0.3;
  let hi = width;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return wrap(text, font, hi, measure);
}

/**
 * The message as large as the room lets it be, up to the chosen size's largest (`MESSAGE_MAX`)
 * and down to a size still easy to read, in balanced lines, every line within the width and
 * within the room; past that it is cut with an ellipsis.
 */
export function messageFit(
  message: string,
  room: number,
  width: number,
  font: (size: number) => ReturnType<typeof display>,
  measure: Measure,
  max = 6.2,
) {
  for (let size = max; size >= MESSAGE_MIN; size -= 0.2) {
    const f = font(size);
    const lines = wrap(message, f, width, measure);
    const height = (lines.length - 1) * size * LINE + size;
    if (height <= room && lines.every((line) => measure(line, f) <= width)) {
      return { font: f, lines: balancedLines(message, f, width, measure) };
    }
  }
  const f = font(MESSAGE_MIN);
  const fits = Math.max(1, Math.floor((room - MESSAGE_MIN) / (MESSAGE_MIN * LINE)) + 1);
  return { font: f, lines: clampLines(wrap(message, f, width, measure), fits) };
}

export function messageFront(
  design: CardDesign,
  content: CardContent,
  colours: StoreColours,
  measure: Measure,
): Shape[] {
  const pal = palette(designParts(design.design).tone, colours);
  const { w, h } = cardSize(design.orientation);
  const { main } = languages(design.language, content.primary);
  const cx = w / 2;
  const width = w - INSIDE * 2;
  const shapes = framed(w, h, pal);

  // The contact at the foot, one line each, left to right as numbers and handles are read.
  const contact = [content.contact?.phone, content.contact?.instagram].filter(
    (line): line is string => Boolean(line?.trim()),
  );
  const contactFont = body("en", 2.6, 400);
  const contactLead = 4.2;
  let foot = h - INSIDE;
  for (const line of [...contact].reverse()) {
    shapes.push({
      kind: "text",
      x: cx,
      y: foot,
      text: line,
      font: { ...contactFont, spacing: 0.15 },
      fill: pal.soft,
      align: "center",
      dir: "ltr",
    });
    foot -= contactLead;
  }

  // The mark in the middle of what is left, as large as the room allows at the store's size.
  const top = INSIDE + 4;
  const bottom = (contact.length ? foot - 2 : h - INSIDE) - 10;
  const boxH = Math.min((bottom - top) * 0.62, width * 0.55);
  const boxW = width * 0.78;
  const boxY = top + (bottom - top - boxH) / 2;
  const mark = placedMark(
    { ...content, logoScale: 1 },
    main,
    { x: cx - boxW / 2, y: boxY, w: boxW, h: boxH },
    "center",
    pal.ink,
    measure,
    "middle",
    width,
  );
  shapes.push(...mark.shapes);
  shapes.push(...ornamentShapes("rule", cx, mark.rect.y + mark.rect.h + 8, 7, pal.metal));
  return shapes;
}

export function messageBack(
  design: CardDesign,
  content: CardContent,
  colours: StoreColours,
  measure: Measure,
): Shape[] {
  const pal = palette(designParts(design.design).tone, colours);
  const { w, h } = cardSize(design.orientation);
  const cx = w / 2;
  const width = w - INSIDE * 2;
  const { main, second } = languages(design.language, content.primary);
  const shapes = framed(w, h, pal);

  // The store's mark, small, hangs from the top; a short rule under it.
  const mark = placedMark(
    { ...content, logoScale: 1 },
    main,
    { x: cx - 11, y: INSIDE - 1, w: 22, h: 6 },
    "center",
    pal.ink,
    measure,
    "top",
    width / 2,
  );
  shapes.push(...mark.shapes);
  const ruleY = mark.rect.y + mark.rect.h + 4.5;
  shapes.push(...ornamentShapes("rule", cx, ruleY, 5, pal.metal));

  let top = ruleY + 9;
  const to = content.to?.trim();
  if (to) {
    shapes.push(oneLine(pair("to", main, second), label(main, 2.1), cx, top, "center", pal.soft));
    const name = messageFit(to, 8, width, (s) => display(main, s, content.fonts), measure);
    top += name.font.size * 1.3 + 1;
    shapes.push(oneLine(name.lines[0] ?? "", name.font, cx, top, "center", pal.ink));
    top += 6;
  }

  // Who it is from stands on the foot of the room inside the frame.
  const from = design.from?.trim();
  let floor = h - INSIDE;
  if (from) {
    const fromName = messageFit(
      from,
      8,
      width,
      (s) => display(main, s, content.fonts),
      measure,
      5.6,
    );
    shapes.push(oneLine(fromName.lines[0] ?? "", fromName.font, cx, floor, "center", pal.ink));
    const labelY = floor - fromName.font.size * 1.25 - 1.2;
    shapes.push(
      oneLine(pair("from", main, second), label(main, 2.1), cx, labelY, "center", pal.soft),
    );
    floor = labelY - 8;
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
      MESSAGE_MAX[content.messageSize ?? "auto"],
    );
    const lh = fitted.font.size * LINE;
    // Centred in the room left between the name and the sender.
    const blockH = (fitted.lines.length - 1) * lh + fitted.font.size;
    const first = top + Math.max(0, (room - blockH) / 2) + fitted.font.size * 0.8;
    shapes.push(...textLines(fitted.lines, fitted.font, cx, first, "center", pal.ink, lh));
  }
  return shapes;
}
