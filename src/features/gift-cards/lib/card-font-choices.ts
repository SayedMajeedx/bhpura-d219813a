import type {
  CardFontChoice,
  CardFontChoices,
  CardFontUpload,
} from "@/lib/data/gift-cards/designs";
import { CARD_FONTS } from "@/features/gift-card-design/lib/type";
import {
  cardFontFamily,
  CARD_FACE_LIST,
  facesFor,
} from "@/features/gift-card-design/lib/card-faces";

/**
 * Choosing a card's font (the owner's request of 2026-11-21): a store picks from the cards' own
 * faces, the platform's faces and the fonts it uploaded before, each shown written in itself, and
 * uploads a font once to keep it in its list. A gift card's font, a gift message card's (which
 * starts as the gift cards') and one message card's at print time (which starts as the settings')
 * are chosen the same way; what "nothing chosen" means is the picker's `base`.
 */

/** How many uploads a store keeps to choose from. */
export const LIBRARY_MAX = 12;

/**
 * What choosing nothing means: the cards' own faces (a gift card), the gift cards' font (a gift
 * message card's setting), or the settings' font (one message card at print time).
 */
export type FontBase = "own" | "gift" | "settings";

export type FontOptionGroup = "default" | "own" | "platform" | "mine";

export type FontOption = {
  key: string;
  choice: CardFontChoice | null;
  group: FontOptionGroup;
  /** Its name, in the reader's language. */
  name: string;
  /** How a sample of it is set on the page. */
  style: { fontFamily: string; fontWeight: number };
  /** An upload's address. */
  url?: string;
};

/** A font file's name without its extension, as the merchant named it. */
export const fontName = (file: string) =>
  file
    .replace(/\.(woff2?|ttf|otf)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 60);

const OWN_NAME = { ar: "خط البطاقات", en: "The cards' own" };
const DEFAULT_NAME: Record<Exclude<FontBase, "own">, { ar: string; en: string }> = {
  gift: { ar: "نفس خط بطاقات الهدايا", en: "Same as the gift cards" },
  settings: { ar: "كما في الإعدادات", en: "As in the settings" },
};
const UPLOAD_NAME = { ar: "خط مرفوع", en: "Uploaded font" };

const isOwn = (choice: CardFontChoice | null | undefined) =>
  Boolean(choice && "face" in choice && choice.face === "own");

/** How a choice's sample is set on the page, in a language's letters. */
export function choiceStyle(
  choice: CardFontChoice | null | undefined,
  script: "ar" | "en",
): FontOption["style"] {
  const fallback = script === "ar" ? CARD_FONTS.displayAr : CARD_FONTS.displayEn;
  if (choice && "url" in choice) {
    return { fontFamily: `"${cardFontFamily(script, choice.url)}", ${fallback}`, fontWeight: 400 };
  }
  const face =
    choice && "face" in choice ? CARD_FACE_LIST.find((f) => f.id === choice.face) : undefined;
  if (face && face.scripts.includes(script)) {
    return { fontFamily: `"${face.family}", ${fallback}`, fontWeight: face.weight };
  }
  return { fontFamily: fallback, fontWeight: script === "ar" ? 200 : 300 };
}

/** The key a choice is picked under in a picker with this base. */
export function choiceKey(choice: CardFontChoice | null | undefined, base: FontBase): string {
  if (!choice) return base === "own" ? "own" : "default";
  if ("url" in choice) return choice.url;
  return choice.face === "own" ? "own" : `face:${choice.face}`;
}

/**
 * A picker's options for a language: what choosing nothing means (unless it is the cards' own
 * faces), the cards' own faces, the platform's faces with that language's letters, then the
 * store's uploads. `inherited` is the font choosing nothing gives, for its sample.
 */
export function fontOptions(
  script: "ar" | "en",
  library: readonly CardFontUpload[],
  lang: "ar" | "en",
  base: FontBase,
  inherited: CardFontChoice | null = null,
): FontOption[] {
  const options: FontOption[] = [];
  if (base !== "own") {
    options.push({
      key: "default",
      choice: null,
      group: "default",
      name: DEFAULT_NAME[base][lang],
      style: choiceStyle(isOwn(inherited) ? null : inherited, script),
    });
  }
  options.push({
    key: "own",
    choice: base === "own" ? null : { face: "own" },
    group: "own",
    name: OWN_NAME[lang],
    style: choiceStyle(null, script),
  });
  for (const face of facesFor(script)) {
    options.push({
      key: `face:${face.id}`,
      choice: { face: face.id },
      group: "platform",
      name: face.family,
      style: choiceStyle({ face: face.id }, script),
    });
  }
  for (const upload of library) {
    options.push({
      key: upload.url,
      choice: upload,
      group: "mine",
      name: upload.name || UPLOAD_NAME[lang],
      style: choiceStyle(upload, script),
      url: upload.url,
    });
  }
  return options;
}

/** A choice's name, in the reader's language. */
export function choiceName(
  choice: CardFontChoice | null | undefined,
  script: "ar" | "en",
  lang: "ar" | "en",
  base: FontBase,
): string {
  if (choice && "url" in choice) return choice.name || UPLOAD_NAME[lang];
  const key = choiceKey(choice, base);
  return fontOptions(script, [], lang, base).find((o) => o.key === key)?.name ?? OWN_NAME[lang];
}

/** The list with an upload added at its end (null when the list is full). */
export function addUpload(
  library: readonly CardFontUpload[],
  upload: CardFontUpload,
): CardFontUpload[] | null {
  if (library.some((font) => font.url === upload.url)) return [...library];
  if (library.length >= LIBRARY_MAX) return null;
  return [...library, upload];
}

export const removeUpload = (library: readonly CardFontUpload[], url: string) =>
  library.filter((font) => font.url !== url);

/** The uploads chosen anywhere (they stay in the list while chosen). */
export function uploadsInUse(...sets: CardFontChoices[]): Set<string> {
  const used = new Set<string>();
  for (const set of sets) {
    for (const choice of [set.ar, set.en]) if (choice && "url" in choice) used.add(choice.url);
  }
  return used;
}

/** The list holding every upload chosen (a store's uploads from before the list are added). */
export function libraryWith(
  library: readonly CardFontUpload[],
  ...sets: CardFontChoices[]
): CardFontUpload[] {
  const list = [...library];
  for (const set of sets) {
    for (const choice of [set.ar, set.en]) {
      if (choice && "url" in choice && !list.some((font) => font.url === choice.url)) {
        list.push(choice);
      }
    }
  }
  return list;
}

/** The words a font is shown with: the store's name in that language, else a short greeting. */
export function fontSample(
  script: "ar" | "en",
  storeName: { ar: string | null; en: string | null },
): string {
  const name = storeName[script]?.trim();
  const fits = name && (script === "ar" ? /\p{Script=Arabic}/u : /[A-Za-z]/).test(name);
  if (fits) return name;
  return script === "ar" ? "هدية لك" : "A gift for you";
}

/** The letters a font must have for a language's words (an English upload has no Arabic). */
export const scriptLetters = (script: "ar" | "en") =>
  script === "ar" ? "هدية سعيدة" : "Gift Happy";
