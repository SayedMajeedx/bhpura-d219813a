/**
 * The hero settings' live preview: the settings page draws the storefront's own hero in a frame
 * (src/routes/hero-preview.tsx) and sends it what is being edited. A frame has its own screen
 * width, so a phone-wide frame lays the hero out as a phone does (the hero's sizes follow the
 * screen, not the box it sits in). The frame fetches nothing and listens only to its own page.
 */

export const HERO_PREVIEW_DRAFT = "boutq:hero-preview:draft";
export const HERO_PREVIEW_READY = "boutq:hero-preview:ready";
export const HERO_PREVIEW_HEIGHT = "boutq:hero-preview:height";

export type HeroPreviewDevice = "desktop" | "mobile";

/** The screen each device is drawn at: a laptop, and an iPhone's width. */
export const HERO_PREVIEW_WIDTH: Record<HeroPreviewDevice, number> = {
  desktop: 1440,
  mobile: 390,
};

export type HeroPreviewBrand = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  primary_color: string | null;
};

export type HeroPreviewDraft = {
  type: typeof HERO_PREVIEW_DRAFT;
  brand: HeroPreviewBrand;
  /** The store's settings row as it is being edited (the storefront reads the same row). */
  settings: Record<string, unknown>;
  slides: Record<string, unknown>[];
  background: Record<string, unknown> | null;
  lang: "ar" | "en";
  /** Bumped to play the headline from its first phrase again. */
  replay: number;
};

export function heroPreviewDraft(input: Omit<HeroPreviewDraft, "type">): HeroPreviewDraft {
  return { type: HERO_PREVIEW_DRAFT, ...input };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A draft the frame can draw, or null for anything else that reaches it. */
export function readHeroPreviewDraft(data: unknown): HeroPreviewDraft | null {
  if (!isRecord(data) || data.type !== HERO_PREVIEW_DRAFT) return null;
  const { brand, settings, slides, background, lang, replay } = data;
  if (!isRecord(brand) || typeof brand.id !== "string" || typeof brand.slug !== "string") {
    return null;
  }
  if (!isRecord(settings) || !Array.isArray(slides) || !slides.every(isRecord)) return null;
  return {
    type: HERO_PREVIEW_DRAFT,
    brand: {
      id: brand.id,
      slug: brand.slug,
      name_en: String(brand.name_en ?? ""),
      name_ar: typeof brand.name_ar === "string" ? brand.name_ar : null,
      primary_color: typeof brand.primary_color === "string" ? brand.primary_color : null,
    },
    settings,
    slides: slides as Record<string, unknown>[],
    background: isRecord(background) ? background : null,
    lang: lang === "en" ? "en" : "ar",
    replay: Number(replay) || 0,
  };
}

/** A message from the page that holds the frame: same address, and that very page. */
export function fromParent(
  event: Pick<MessageEvent, "origin" | "source">,
  own: { origin: string; parent: unknown },
): boolean {
  return event.origin === own.origin && event.source === own.parent;
}

/** How much the frame is scaled down to fit the width available in the settings page. */
export function heroPreviewScale(device: HeroPreviewDevice, available: number): number {
  const width = HERO_PREVIEW_WIDTH[device];
  if (!(available > 0)) return 1;
  return Math.min(1, available / width);
}

/** The Arabic and English headlines tell the same story: a note when one has more phrases. */
export function phraseCountNote(
  slide: { phrases_ar?: unknown[]; phrases_en?: unknown[] },
  lang: "ar" | "en",
): string | null {
  const count = (list: unknown[] | undefined) =>
    (list ?? []).filter((phrase) => String(phrase ?? "").trim()).length;
  const ar = count(slide.phrases_ar);
  const en = count(slide.phrases_en);
  if (ar === en || ar === 0 || en === 0) return null;
  return lang === "ar"
    ? `الجمل العربية ${ar} والإنجليزية ${en}: زائر الإنجليزية يرى قصة مختلفة.`
    : `${ar} Arabic phrases and ${en} English: an English visitor sees a different story.`;
}
