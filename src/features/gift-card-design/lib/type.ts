import type { Align, CardFont, Shape } from "./geometry";
import type { CardLanguage } from "./design";

/**
 * The card's type: two faces per script, set as a typographer would (a display face for the
 * greeting, a quiet text face for the rest, tracked capitals only for Latin labels), and the
 * rules that fit and break a line. Text is measured by the page (`Measure`), so a line is broken
 * where it will really break, in the browser and on paper alike.
 */

export const CARD_FONTS = {
  /** Large Arabic: an extra-light face, as fine as the Latin. */
  displayAr: '"29LT Azer", "29LT Kaff", "Readex Pro", Tahoma, sans-serif',
  /** Smaller Arabic display (under 6 mm the extra-light face is too thin to print). */
  displayArSmall: '"29LT Kaff", "Readex Pro", Tahoma, sans-serif',
  displayEn: '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif',
  bodyEn: '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif',
  bodyAr: '"Readex Pro", "Tajawal", Tahoma, sans-serif',
} as const;

/** The faces a card uses, to load before it is drawn on a canvas or printed. */
export const CARD_FACES = [
  '200 40px "29LT Azer"',
  '300 40px "29LT Kaff"',
  '300 40px "Readex Pro"',
  '400 40px "Readex Pro"',
  '500 40px "Readex Pro"',
  '300 40px "Plus Jakarta Sans"',
  '400 40px "Plus Jakarta Sans"',
  '500 40px "Plus Jakarta Sans"',
  '600 40px "Plus Jakarta Sans"',
];

/** The size at which large Arabic moves to the extra-light face. */
const LIGHT_FROM = 6;

/** How wide a line is, in millimetres, in a font. */
export type Measure = (text: string, font: CardFont) => number;

/** A rough measure for when no page can measure (tests, the server). */
export const roughMeasure: Measure = (text, font) =>
  [...text].length * font.size * (/\p{Script=Arabic}/u.test(text) ? 0.48 : 0.52) +
  Math.max([...text].length - 1, 0) * (font.spacing ?? 0);

export const isArabic = (text: string) => /\p{Script=Arabic}/u.test(text);

/** A line's direction by its first letter, as the browser's own "auto" reads it. */
export const lineDir = (text: string): "ltr" | "rtl" =>
  /^[^\p{L}]*\p{Script=Arabic}/u.test(text) ? "rtl" : "ltr";

/** The families of the store's own card fonts, by language (null: the cards' own faces). */
export type CardFamilies = { ar: string | null; en: string | null };

/** A short, stable name for an uploaded font, so a font changed later is never mistaken for it. */
export function cardFontFamily(lang: "ar" | "en", url: string): string {
  let hash = 5381;
  for (const ch of url) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `BoutqCard${lang === "ar" ? "Ar" : "En"}${hash.toString(36)}`;
}

const isCustom = (family: string) => family.startsWith('"BoutqCard');
const isArabicFamily = (family: string) => family.startsWith('"BoutqCardAr');

/**
 * The greeting's face: the store's own font for that language when it uploaded one, else
 * extra-light when large and a touch heavier when small, never bold.
 */
export function display(lang: "ar" | "en", size: number, fonts?: CardFamilies | null): CardFont {
  const custom = fonts?.[lang];
  if (custom) {
    const fallback = lang === "ar" ? CARD_FONTS.displayAr : CARD_FONTS.displayEn;
    return { family: `"${custom}", ${fallback}`, weight: 400, size };
  }
  if (lang === "ar") {
    return size >= LIGHT_FROM
      ? { family: CARD_FONTS.displayAr, weight: 200, size }
      : { family: CARD_FONTS.displayArSmall, weight: 300, size };
  }
  return { family: CARD_FONTS.displayEn, weight: size >= LIGHT_FROM ? 300 : 400, size };
}

export function body(lang: "ar" | "en", size: number, weight = 400): CardFont {
  return { family: lang === "ar" ? CARD_FONTS.bodyAr : CARD_FONTS.bodyEn, weight, size };
}

/** A small label: tracked capitals in Latin, plain medium weight in Arabic. */
export function label(lang: "ar" | "en", size: number): CardFont {
  return lang === "ar"
    ? { family: CARD_FONTS.bodyAr, weight: 400, size: size * 1.25 }
    : { family: CARD_FONTS.bodyEn, weight: 600, size, spacing: size * 0.2 };
}

/** The line height a face needs: Arabic display letters reach far above and below. */
export function leading(font: CardFont): number {
  if (isCustom(font.family)) return font.size * (isArabicFamily(font.family) ? 1.45 : 1.15);
  if (font.family === CARD_FONTS.displayAr || font.family === CARD_FONTS.displayArSmall) {
    return font.size * 1.42;
  }
  if (font.family === CARD_FONTS.displayEn && font.size >= LIGHT_FROM) return font.size * 1.12;
  return font.size * 1.55;
}

export type Languages = { main: "ar" | "en"; second: "ar" | "en" | null };

/** The card's languages: one, or both with the buyer's own leading. */
export function languages(language: CardLanguage, primary: "ar" | "en"): Languages {
  if (language === "both") return { main: primary, second: primary === "ar" ? "en" : "ar" };
  return { main: language, second: null };
}

export const dirOf = (lang: "ar" | "en") => (lang === "ar" ? "rtl" : "ltr");
export const startOf = (lang: "ar" | "en"): Align => (lang === "ar" ? "right" : "left");
export const endOf = (lang: "ar" | "en"): Align => (lang === "ar" ? "left" : "right");

/** Breaks text into lines no wider than `maxW` (a word wider than it keeps its own line). */
export function wrap(text: string, font: CardFont, maxW: number, measure: Measure): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tried = line ? `${line} ${word}` : word;
    if (line && measure(tried, font) > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = tried;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** At most `max` lines; the last one closed with an ellipsis when text is left over. */
export function clampLines(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = `${kept[max - 1].replace(/[\s.,،]+$/, "")}…`;
  return kept;
}

/**
 * The largest size (down to `min`) at which `text` sets in `maxLines` lines no wider than `maxW`,
 * and its lines; at `min` it takes as many lines as it needs, up to `maxLines`.
 */
export function fitText(
  text: string,
  font: (size: number) => CardFont,
  maxW: number,
  max: number,
  min: number,
  maxLines: number,
  measure: Measure,
): { font: CardFont; lines: string[] } {
  for (let size = max; size >= min; size -= 0.25) {
    const f = font(size);
    const lines = wrap(text, f, maxW, measure);
    if (lines.length <= maxLines && lines.every((line) => measure(line, f) <= maxW)) {
      return { font: f, lines };
    }
  }
  const f = font(min);
  return { font: f, lines: clampLines(wrap(text, f, maxW, measure), maxLines) };
}

/** Lines set from a first baseline down. */
export function textLines(
  lines: string[],
  font: CardFont,
  x: number,
  firstBaseline: number,
  align: Align,
  fill: string,
  lineHeight = leading(font),
): Shape[] {
  return lines.map((text, index) => ({
    kind: "text" as const,
    x,
    y: firstBaseline + index * lineHeight,
    // Tracked capitals are for Latin alone: a line holding Arabic is never spaced apart.
    text: font.spacing ? text.toUpperCase() : text,
    font: font.spacing && isArabic(text) ? { ...font, spacing: 0 } : font,
    fill,
    align,
    dir: lineDir(text),
  }));
}

/** One line of text at a baseline. */
export function oneLine(
  text: string,
  font: CardFont,
  x: number,
  y: number,
  align: Align,
  fill: string,
): Shape {
  return textLines([text], font, x, y, align, fill)[0];
}

/** The x a line aligned `align` starts from, inside margins `m` of a width `w`. */
export function alignX(align: Align, w: number, m: number): number {
  if (align === "center") return w / 2;
  return align === "left" ? m : w - m;
}
