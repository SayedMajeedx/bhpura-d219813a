import type { StoreColours } from "@/features/content-studio/lib/studio-styles";
import { formatMoney } from "@/lib/format";
import { designParts, palette, type CardDesign } from "./design";
import { BLEED, cardSize, type Align, type Shape } from "./geometry";
import { placedMark, spendLine, storeNameIn, type CardContent } from "./content";
import {
  CARD_FONTS,
  alignX,
  body,
  clampLines,
  display,
  endOf,
  fitText,
  label,
  languages,
  leading,
  oneLine,
  startOf,
  textLines,
  wrap,
  type Measure,
} from "./type";

/**
 * A card's back, the same on every design (as a postcard's is): who it is for and from, the
 * buyer's note, then what it is worth, its code in a ruled box, until when, and how to use it.
 * Portrait sets these in one column; landscape in two, the note beside the value.
 */

/** Shown where the code will be until the card is paid. */
export const CODE_PLACEHOLDER = "••••-••••-••••";

const WORDS = {
  to: { ar: "إلى", en: "To" },
  from: { ar: "من", en: "From" },
  value: { ar: "القيمة", en: "Value" },
  code: { ar: "رمز البطاقة", en: "Card code" },
  card: { ar: "بطاقة هدية", en: "Gift card" },
};

function pair(key: keyof typeof WORDS, main: "ar" | "en", second: "ar" | "en" | null): string {
  return second ? `${WORDS[key][main]} · ${WORDS[key][second]}` : WORDS[key][main];
}

function expiryLine(day: string, lang: "ar" | "en"): string {
  const date = new Date(`${day}T12:00:00Z`).toLocaleDateString(
    lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
  );
  return lang === "ar" ? `صالحة حتى ${date}` : `Valid until ${date}`;
}

function howToUseLine(link: string, lang: "ar" | "en"): string {
  return lang === "ar"
    ? `يُكتب الرمز عند الدفع في ${link}`
    : `Enter the code at checkout on ${link}`;
}

type Column = { x0: number; x1: number };

/** Value, code, expiry and use, from the foot of a column up; returns the top it reached. */
function valueBlock(
  design: CardDesign,
  content: CardContent,
  col: Column,
  foot: number,
  ink: { ink: string; soft: string; metal: string; rule: string },
  measure: Measure,
): { shapes: Shape[]; top: number } {
  const { main, second } = languages(design.language, content.primary);
  const align: Align = startOf(main);
  const x = align === "left" ? col.x0 : col.x1;
  const width = col.x1 - col.x0;
  const shapes: Shape[] = [];
  let y = foot;
  const small = body(main, 2.45);
  const use = clampLines(wrap(howToUseLine(content.storeLink, main), small, width, measure), 2);
  shapes.push(...textLines(use, small, x, y - (use.length - 1) * leading(small), align, ink.soft));
  y -= use.length * leading(small) + 0.6;
  if (content.expiresOn) {
    shapes.push(oneLine(expiryLine(content.expiresOn, main), small, x, y, align, ink.soft));
    y -= leading(small) + 1.6;
  }
  const boxH = 10.5;
  const boxTop = y - boxH;
  shapes.push({
    kind: "rect",
    x: col.x0,
    y: boxTop,
    w: width,
    h: boxH,
    stroke: ink.metal,
    width: 0.3,
    radius: 1.2,
  });
  const code = content.code ?? CODE_PLACEHOLDER;
  const codeFont = fitText(
    code,
    (size) => ({ family: CARD_FONTS.bodyEn, weight: 600, size, spacing: size * 0.16 }),
    width - 6,
    4.4,
    2.8,
    1,
    measure,
  ).font;
  shapes.push({
    kind: "text",
    x: (col.x0 + col.x1) / 2,
    y: boxTop + boxH / 2 + codeFont.size * 0.36,
    text: code,
    font: codeFont,
    fill: content.code ? ink.ink : ink.soft,
    align: "center",
    dir: "ltr",
  });
  y = boxTop - 2.2;
  shapes.push(oneLine(pair("code", main, second), label(main, 2.05), x, y, align, ink.soft));
  y -= 7;
  if (content.amount !== null) {
    const store = storeNameIn(content, main);
    const spend = body(main, 2.7);
    shapes.push(oneLine(spendLine(content.kind, store, main), spend, x, y, align, ink.soft));
    y -= leading(spend) + 0.4;
    const money = formatMoney(content.amount, content.currency, main).replace(
      /\u00a0|\u202f/g,
      " ",
    );
    const amountFont = fitText(
      money,
      (s) => display(main, s, content.fonts),
      width,
      8,
      5,
      1,
      measure,
    ).font;
    shapes.push(oneLine(money, amountFont, x, y, align, ink.ink));
    y -= amountFont.size * 1.15;
    shapes.push(oneLine(pair("value", main, second), label(main, 2.05), x, y, align, ink.soft));
    y -= 4.5;
  }
  return { shapes, top: y };
}

/** To, from and the note, from a top down to a floor. */
function personalBlock(
  design: CardDesign,
  content: CardContent,
  col: Column,
  top: number,
  floor: number,
  ink: { ink: string; soft: string },
  measure: Measure,
): Shape[] {
  const { main, second } = languages(design.language, content.primary);
  const align: Align = startOf(main);
  const x = align === "left" ? col.x0 : col.x1;
  const width = col.x1 - col.x0;
  const shapes: Shape[] = [];
  let y = top;
  if (content.to?.trim()) {
    shapes.push(oneLine(pair("to", main, second), label(main, 2.05), x, y, align, ink.soft));
    const name = fitText(
      content.to.trim(),
      (s) => display(main, s, content.fonts),
      width,
      6.4,
      4,
      1,
      measure,
    );
    y += name.font.size * 1.25 + 1;
    shapes.push(oneLine(name.lines[0] ?? "", name.font, x, y, align, ink.ink));
    y += 7.5;
  }
  if (design.from?.trim()) {
    shapes.push(oneLine(pair("from", main, second), label(main, 2.05), x, y, align, ink.soft));
    const from = body(main, 3.4);
    y += 5;
    shapes.push(oneLine(design.from.trim(), from, x, y, align, ink.ink));
    y += 7.5;
  }
  if (content.message?.trim()) {
    const font = body(main, 3.2);
    const lh = leading(font);
    const room = Math.max(Math.floor((floor - y) / lh), 0);
    if (room > 0) {
      const lines = clampLines(wrap(content.message.trim(), font, width, measure), room);
      shapes.push(...textLines(lines, font, x, y + 1, align, ink.ink));
    }
  }
  return shapes;
}

export function cardBack(
  design: CardDesign,
  content: CardContent,
  colours: StoreColours,
  measure: Measure,
): Shape[] {
  const { tone } = designParts(design.design);
  const pal = palette(tone, colours);
  const { w, h } = cardSize(design.orientation);
  const m = Math.min(w, h) * 0.085;
  const { main, second } = languages(design.language, content.primary);
  const ink = { ink: pal.ink, soft: pal.soft, metal: pal.metal, rule: pal.rule };
  const shapes: Shape[] = [
    { kind: "rect", x: -BLEED, y: -BLEED, w: w + BLEED * 2, h: h + BLEED * 2, fill: pal.ground },
  ];
  const start = startOf(main);
  // The mark hangs from the top margin, and the "gift card" label's capitals hang from the same
  // line; what is written below starts clear of the mark at whatever size the store chose.
  const mark = placedMark(
    content,
    main,
    { x: start === "left" ? m : w - m - 26, y: m, w: 26, h: 7 },
    start,
    pal.ink,
    measure,
    "top",
    // Beside the "gift card" label: at most half the room between the margins.
    (w - m * 2) / 2,
  );
  const cardLabel = label(main, 2.05);
  shapes.push(
    ...mark.shapes,
    oneLine(
      pair("card", main, second),
      cardLabel,
      alignX(endOf(main), w, m),
      m + cardLabel.size * 0.72,
      endOf(main),
      pal.metal,
    ),
  );
  const below = Math.max(m + 19, mark.rect.y + mark.rect.h + 9);
  if (design.orientation === "portrait") {
    const col = { x0: m, x1: w - m };
    const value = valueBlock(design, content, col, h - m, ink, measure);
    shapes.push(...value.shapes);
    const ruleY = value.top - 1;
    shapes.push({
      kind: "path",
      d: `M${m} ${ruleY}L${w - m} ${ruleY}`,
      stroke: pal.rule,
      width: 0.25,
    });
    shapes.push(...personalBlock(design, content, col, below, ruleY - 4, ink, measure));
    return shapes;
  }
  const gutter = 10;
  const half = (w - m * 2 - gutter) / 2;
  const startCol = start === "left" ? { x0: m, x1: m + half } : { x0: w - m - half, x1: w - m };
  const endCol = start === "left" ? { x0: w - m - half, x1: w - m } : { x0: m, x1: m + half };
  const mid = w / 2;
  shapes.push({
    kind: "path",
    d: `M${mid} ${below - 5}L${mid} ${h - m}`,
    stroke: pal.rule,
    width: 0.25,
  });
  shapes.push(...personalBlock(design, content, startCol, below, h - m, ink, measure));
  shapes.push(...valueBlock(design, content, endCol, h - m, ink, measure).shapes);
  return shapes;
}
