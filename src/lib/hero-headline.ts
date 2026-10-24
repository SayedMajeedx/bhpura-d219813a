/**
 * The hero's headline as live text: one or several phrases shown one after another over the
 * slide, each appearing with the style the store chose. Text written into a video is cropped
 * whenever the frame is shorter than the video (a compact hero showed 39% of Pura's video on a wide
 * screen, its title cut off); live text is laid out for every frame, language and screen.
 */

export type HeroTextAnimation = "blur_in" | "rising_words" | "mask_reveal" | "none";
export type HeroTextPosition = "top" | "middle" | "bottom";
export type HeroTextAlign = "start" | "center" | "end";
export type HeroTextSize = "s" | "m" | "l" | "xl";
/** Light text over a dark shade (a dark video), or dark text over a light shade (a light one). */
export type HeroTextTone = "light" | "dark";

/** What a slide may carry about its headline (all optional: a slide without them is as before). */
export type HeroHeadlineFields = {
  title_ar?: string;
  title_en?: string;
  phrases_ar?: string[];
  phrases_en?: string[];
  text_animation?: HeroTextAnimation;
  /** How long each phrase stays, in seconds. */
  text_seconds?: number;
  /** How many times the phrases go round before resting on the first one. */
  text_loops?: number;
  text_position?: HeroTextPosition;
  text_size?: HeroTextSize;
  /** On a phone (below 640px) the text may sit and size differently; unset = as on a laptop. */
  text_position_mobile?: HeroTextPosition;
  text_size_mobile?: HeroTextSize;
  align?: HeroTextAlign;
  /** The slide's own look; each falls back to the store's (hero_overlay_strength, hero_title_color_v2). */
  text_tone?: HeroTextTone;
  shade?: number;
  text_color?: string;
};

/** The headline fields a stored slide adds (the storefront's and the editor's slide types). */
export type HeroHeadlineSlideFields = Pick<
  HeroHeadlineFields,
  | "phrases_ar"
  | "phrases_en"
  | "text_animation"
  | "text_seconds"
  | "text_loops"
  | "text_position"
  | "text_size"
  | "text_position_mobile"
  | "text_size_mobile"
  | "text_tone"
  | "shade"
  | "text_color"
>;

export const HERO_TEXT_ANIMATIONS: readonly HeroTextAnimation[] = [
  "blur_in",
  "rising_words",
  "mask_reveal",
  "none",
];
export const DEFAULT_TEXT_SECONDS = 3.5;
export const DEFAULT_TEXT_LOOPS = 3;

const clean = (list: readonly unknown[] | undefined) =>
  (list ?? []).map((phrase) => String(phrase ?? "").trim()).filter(Boolean);

/**
 * The phrases a slide shows in a language: its own phrases, else the other language's, else its
 * title as the only one. Empty when the slide has no headline at all.
 */
export function headlinePhrases(slide: HeroHeadlineFields, lang: "ar" | "en"): string[] {
  const own = clean(lang === "ar" ? slide.phrases_ar : slide.phrases_en);
  if (own.length > 0) return own;
  const other = clean(lang === "ar" ? slide.phrases_en : slide.phrases_ar);
  if (other.length > 0) return other;
  const title =
    (lang === "ar" ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar) ?? "";
  return title.trim() ? [title.trim()] : [];
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== ""
    ? Math.min(max, Math.max(min, n))
    : fallback;
};

/** A slide's headline settings, each with its default (blur-in, 3.5 s, 3 rounds, at the bottom). */
const POSITIONS: readonly HeroTextPosition[] = ["top", "middle", "bottom"];
const SIZES: readonly HeroTextSize[] = ["s", "m", "l", "xl"];
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null =>
  list.includes(value as T) ? (value as T) : null;

export function headlineSettings(slide: HeroHeadlineFields) {
  const position = oneOf(POSITIONS, slide.text_position) ?? "bottom";
  const size = oneOf(SIZES, slide.text_size) ?? "m";
  return {
    animation: HERO_TEXT_ANIMATIONS.includes(slide.text_animation as HeroTextAnimation)
      ? (slide.text_animation as HeroTextAnimation)
      : "blur_in",
    seconds: clamp(slide.text_seconds, 2, 8, DEFAULT_TEXT_SECONDS),
    loops: Math.round(clamp(slide.text_loops, 1, 10, DEFAULT_TEXT_LOOPS)),
    position,
    size,
    positionMobile: oneOf(POSITIONS, slide.text_position_mobile) ?? position,
    sizeMobile: oneOf(SIZES, slide.text_size_mobile) ?? size,
    align: (["start", "center", "end"] as const).includes(slide.align as HeroTextAlign)
      ? (slide.align as HeroTextAlign)
      : "start",
  };
}

/**
 * Which phrase shows at a step, and whether it is the last step: the phrases go round `loops`
 * times, then rest on the first one (a headline that never stops tires the eye, and moving text
 * should stop: WCAG 2.2.2). A single phrase appears once and stays.
 */
export function headlineStep(step: number, count: number, loops: number) {
  if (count <= 1) return { index: 0, done: true };
  const last = count * loops;
  if (step >= last) return { index: 0, done: true };
  return { index: step % count, done: false };
}

/** The direction a word is written in, from its first letter; null for digits and signs. */
function wordDirection(word: string): "rtl" | "ltr" | null {
  for (const char of word) {
    if (/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(char)) return "rtl";
    if (/\p{L}/u.test(char)) return "ltr";
  }
  return null;
}

/**
 * A phrase cut into the pieces that appear one after another (rising words). Arabic is never cut
 * inside a word (its letters join), and a run written the other way ("PURA LINE" in an Arabic
 * phrase) stays one piece: each piece is a box of its own, and boxes in an Arabic line are set
 * right to left, so "PURA" and "LINE" apart would read "LINE PURA".
 */
export function headlinePieces(
  phrase: string,
  base: "rtl" | "ltr",
): { text: string; dir: "rtl" | "ltr" }[] {
  const pieces: { text: string; dir: "rtl" | "ltr" }[] = [];
  for (const word of phrase.split(/\s+/).filter(Boolean)) {
    const dir = wordDirection(word) ?? pieces.at(-1)?.dir ?? base;
    const previous = pieces.at(-1);
    if (previous && dir !== base && previous.dir === dir) {
      previous.text = `${previous.text} ${word}`;
    } else {
      pieces.push({ text: word, dir });
    }
  }
  return pieces;
}

/** Where the text block sits in the frame. */
export const HERO_TEXT_POSITION_CLASS: Record<HeroTextPosition, string> = {
  top: "justify-start",
  middle: "justify-center",
  bottom: "justify-end",
};
/** The same from 640px up, for a slide whose text sits elsewhere on a phone. */
export const HERO_TEXT_POSITION_CLASS_SM: Record<HeroTextPosition, string> = {
  top: "sm:justify-start",
  middle: "sm:justify-center",
  bottom: "sm:justify-end",
};

/** How the text block lines up, on the reading side ("start" is the right in Arabic). */
export const HERO_TEXT_ALIGN_CLASS: Record<HeroTextAlign, string> = {
  start: "items-start text-start",
  center: "items-center text-center",
  end: "items-end text-end",
};

/**
 * The buttons under the headline, lined up like it. The headline's box is as wide as its longest
 * phrase, so a row left at its start sat at that box's edge, far from a short centred phrase.
 */
export const HERO_ACTIONS_ALIGN_CLASS: Record<HeroTextAlign, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

/** The headline's size against the frame's own (compact, standard, cinematic). */
export const HERO_TEXT_SCALE: Record<HeroTextSize, number> = { s: 0.8, m: 1, l: 1.22, xl: 1.45 };

/**
 * The shade over the media, deepest where the text sits so it reads over any frame: black under
 * light text, white under dark text (a light video).
 */
export function heroScrim(
  position: HeroTextPosition,
  strong: number,
  soft: number,
  tone: HeroTextTone = "light",
): string {
  const channel = tone === "dark" ? "255,255,255" : "0,0,0";
  const shade = (alpha: number) => `rgba(${channel},${Number(alpha.toFixed(3))})`;
  if (position === "top") {
    return `linear-gradient(to bottom, ${shade(strong)}, ${shade(soft)} 45%, ${shade(0)})`;
  }
  if (position === "middle") {
    return `linear-gradient(to bottom, ${shade(soft * 0.6)}, ${shade(strong * 0.85)} 50%, ${shade(soft * 0.6)})`;
  }
  return `linear-gradient(to top, ${shade(strong)}, ${shade(soft)} 45%, ${shade(0)})`;
}

/** The dark text of a light slide, unless the slide chose its own colour. */
export const HERO_DARK_TEXT = "rgb(20, 20, 20)";

/** One tap for the two common cases: a dark video (light text) and a light one (dark text). */
export const HERO_LOOK_PRESETS = {
  dark_video: { text_tone: "light", shade: 45, text_color: "" },
  light_video: { text_tone: "dark", shade: 35, text_color: "" },
} as const satisfies Record<string, Pick<HeroHeadlineFields, "text_tone" | "shade" | "text_color">>;

/**
 * How a slide's text and shade look: the slide's own choices, else the store's (the shade strength
 * and title colour every slide shared before). A dark-text slide never takes the store's title
 * colour, which was chosen for light text over a dark shade.
 */
export function slideLook(
  slide: Pick<HeroHeadlineFields, "text_tone" | "shade" | "text_color">,
  store: { hero_overlay_strength?: number | null; hero_title_color_v2?: string | null },
) {
  const tone: HeroTextTone = slide.text_tone === "dark" ? "dark" : "light";
  const shade = clamp(slide.shade ?? store.hero_overlay_strength, 0, 100, 45);
  const own = slide.text_color?.trim();
  const titleColor =
    own || (tone === "dark" ? HERO_DARK_TEXT : store.hero_title_color_v2?.trim() || undefined);
  return {
    tone,
    shade,
    titleColor,
    strong: (shade / 100) * 0.95,
    soft: (shade / 100) * 0.45,
  };
}

/**
 * How fast the phrases follow one another, in the words a merchant uses: seconds each phrase
 * stays. A number the store typed that is none of them is its own pace.
 */
export const HERO_PACES = { calm: 5, medium: 3.5, lively: 2.5 } as const;
export type HeroPace = keyof typeof HERO_PACES;

export function paceOf(slide: Pick<HeroHeadlineFields, "text_seconds">): HeroPace | null {
  const seconds = headlineSettings(slide).seconds;
  const match = (Object.keys(HERO_PACES) as HeroPace[]).find(
    (pace) => HERO_PACES[pace] === seconds,
  );
  return match ?? null;
}

/**
 * A slide whose headline is only the store's name says nothing the logo above it does not: a
 * note for the settings that a phrase about what the store sells, or what is new, does more
 * (ZH's hero read "ZH").
 */
export function storeNameHeadlineNote(
  slide: HeroHeadlineFields,
  storeNames: ReadonlyArray<string | null | undefined>,
  lang: "ar" | "en",
): string | null {
  const plain = (text: string) => text.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const names = storeNames.map((name) => plain(name ?? "")).filter(Boolean);
  if (names.length === 0) return null;
  const firsts = (["ar", "en"] as const)
    .map((l) => headlinePhrases(slide, l)[0])
    .filter((phrase): phrase is string => Boolean(phrase));
  if (!firsts.some((phrase) => names.includes(plain(phrase)))) return null;
  return lang === "ar"
    ? "العنوان هو اسم المتجر، والشعار يقوله فوقه. جملة عمّا تبيعه أو عن الجديد تشدّ الزائر أكثر."
    : "The headline is the store's name, which the logo above already says. A phrase about what you sell, or what is new, does more.";
}
