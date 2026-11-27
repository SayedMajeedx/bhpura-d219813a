/**
 * The fonts a store may set its cards' large words in (a gift card's greeting, the store's name,
 * who the card is for and its value; a gift message card's names and message), the owner's request
 * of 2026-11-21: choose, never upload again to change. Three kinds:
 *   - the cards' own faces (29LT Azer and Plus Jakarta Sans, light): nothing chosen;
 *   - the platform's own faces below, files under /fonts, so a card is drawn on screen, saved as a
 *     picture and printed in the same letters;
 *   - a font the store uploaded (its address), kept in its list to choose again.
 * In a card's kit a choice travels as one string: an upload's address, or `face:<id>`; `face:own`
 * is the cards' own faces chosen on purpose (a gift message card choosing them over its gift
 * cards' font). Every face here has Arabic and Latin letters, but Inter (Latin only).
 */
import type { CardFontChoice, CardFontChoices } from "@/lib/data/gift-cards/designs";

/** The platform's own faces a card may take. */
export type CardFaceId = "kaff" | "bukra" | "zarid" | "readex" | "tajawal" | "inter";

/** A face's file under /fonts, as the print page declares it. */
type FaceFile = { file: string; weight: string; format?: string; range?: string };

export type CardFace = {
  id: CardFaceId;
  family: string;
  /** The weight a card's large words are set in. */
  weight: number;
  /** The scripts it has letters for. */
  scripts: ReadonlyArray<"ar" | "en">;
  files: FaceFile[];
};

const AR_RANGE =
  "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC";
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

/** The platform's faces, in the order a picker lists them. */
export const CARD_FACE_LIST: readonly CardFace[] = [
  {
    id: "kaff",
    family: "29LT Kaff",
    weight: 300,
    scripts: ["ar", "en"],
    files: [{ file: "kafflight.woff2", weight: "300" }],
  },
  {
    id: "bukra",
    family: "29LT Bukra",
    weight: 500,
    scripts: ["ar", "en"],
    files: [{ file: "bukramed.woff2", weight: "500" }],
  },
  {
    id: "zarid",
    family: "29LT Zarid Display",
    weight: 400,
    scripts: ["ar", "en"],
    files: [{ file: "zariddisplay.woff2", weight: "400" }],
  },
  {
    id: "readex",
    family: "Readex Pro",
    weight: 300,
    scripts: ["ar", "en"],
    files: [
      {
        file: "variable/readex-pro-hexp-wght.woff2",
        weight: "160 700",
        format: "woff2-variations",
      },
    ],
  },
  {
    id: "tajawal",
    family: "Tajawal",
    weight: 400,
    scripts: ["ar", "en"],
    files: [
      { file: "tajawal/tajawal-400-arabic.woff2", weight: "400", range: AR_RANGE },
      { file: "tajawal/tajawal-400-latin.woff2", weight: "400", range: LATIN_RANGE },
    ],
  },
  {
    id: "inter",
    family: "Inter",
    weight: 400,
    scripts: ["en"],
    files: [{ file: "inter.woff2", weight: "400 700" }],
  },
];

/** The cards' own faces, chosen on purpose. */
export const OWN_FACE = "face:own";

/** A font for each language, as a card's kit carries it (null: the cards' own faces). */
export type CardFontSet = { ar: string | null; en: string | null };

export const faceValue = (id: CardFaceId | "own") => `face:${id}`;

/** The faces offered for a language's words. */
export const facesFor = (script: "ar" | "en") =>
  CARD_FACE_LIST.filter((face) => face.scripts.includes(script));

/** A short, stable name for an uploaded font, so a font changed later is never mistaken for it. */
export function cardFontFamily(lang: "ar" | "en", url: string): string {
  let hash = 5381;
  for (const ch of url) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `BoutqCard${lang === "ar" ? "Ar" : "En"}${hash.toString(36)}`;
}

export type CardFontPick =
  { kind: "own" } | { kind: "face"; face: CardFace } | { kind: "file"; url: string };

/**
 * What a kit's font value is: the cards' own faces (nothing, `face:own`, or a face no longer
 * offered), one of the platform's faces for that language, or an uploaded font's address.
 */
export function readPick(value: string | null | undefined, lang: "ar" | "en"): CardFontPick {
  if (!value || !value.trim()) return { kind: "own" };
  if (value.startsWith("face:")) {
    const face = CARD_FACE_LIST.find((f) => `face:${f.id}` === value);
    return face && face.scripts.includes(lang) ? { kind: "face", face } : { kind: "own" };
  }
  return { kind: "file", url: value };
}

/** The family a card's large words take for a language's choice (null: the cards' own faces). */
export function familyOf(lang: "ar" | "en", value: string | null | undefined): string | null {
  const pick = readPick(value, lang);
  if (pick.kind === "face") return pick.face.family;
  if (pick.kind === "file") return cardFontFamily(lang, pick.url);
  return null;
}

/** The weight a chosen family is set in: a platform face's own, an upload's regular. */
export function faceWeight(family: string): number {
  return CARD_FACE_LIST.find((face) => face.family === family)?.weight ?? 400;
}

/** What the browser loads before a card is measured in a choice (null: nothing to load). */
export function faceLoad(lang: "ar" | "en", value: string | null | undefined): string | null {
  const pick = readPick(value, lang);
  if (pick.kind === "face") return `${pick.face.weight} 40px "${pick.face.family}"`;
  if (pick.kind === "file") return `400 40px "${cardFontFamily(lang, pick.url)}"`;
  return null;
}

/** A stored choice as a card's kit carries it (null: nothing chosen). */
export function choiceValue(choice: CardFontChoice | null | undefined): string | null {
  if (!choice) return null;
  if ("face" in choice) return `face:${choice.face}`;
  return choice.url || null;
}

/** The gift cards' fonts, as a kit carries them. */
export const fontSetOf = (choices: CardFontChoices | null | undefined): CardFontSet => ({
  ar: choiceValue(choices?.ar),
  en: choiceValue(choices?.en),
});

/** A gift message card's fonts: its own choice in each language, else the gift cards'. */
export function messageFontSet(
  message: CardFontChoices | null | undefined,
  gift: CardFontSet,
): CardFontSet {
  return {
    ar: choiceValue(message?.ar) ?? gift.ar,
    en: choiceValue(message?.en) ?? gift.en,
  };
}

/** A font address made safe to write inside CSS's url("..."). */
export const cssUrl = (url: string) => url.replace(/["'()\\\s<>]/g, "");

/**
 * The @font-face rules a print page needs for a card's chosen fonts, under the names its text asks
 * for: an upload from its address, a platform face from the page's own host (unless the page
 * declares it already, `declared`), and the faces to load before it prints.
 */
export function printFaceRules(
  fonts: CardFontSet | null | undefined,
  origin: string,
  declared: ReadonlySet<string>,
): { css: string; loads: string[] } {
  const rules = new Map<string, string>();
  const loads: string[] = [];
  for (const lang of ["ar", "en"] as const) {
    const pick = readPick(fonts?.[lang], lang);
    const load = faceLoad(lang, fonts?.[lang]);
    if (load && !loads.includes(load)) loads.push(load);
    if (pick.kind === "file") {
      const family = cardFontFamily(lang, pick.url);
      rules.set(
        family,
        `@font-face{font-family:"${family}";src:url("${cssUrl(pick.url)}");font-weight:100 900;font-style:normal;font-display:block}`,
      );
    } else if (pick.kind === "face" && !declared.has(pick.face.family)) {
      rules.set(
        pick.face.family,
        pick.face.files
          .map(
            (f) =>
              `@font-face{font-family:"${pick.face.family}";src:url("${origin}/fonts/${f.file}") format("${f.format ?? "woff2"}");font-weight:${f.weight};font-style:normal;font-display:block${f.range ? `;unicode-range:${f.range}` : ""}}`,
          )
          .join(""),
      );
    }
  }
  return { css: [...rules.values()].join(""), loads };
}
