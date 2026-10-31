import {
  contrastRatio,
  mixColours,
  readableInk,
  type StoreColours,
} from "@/features/content-studio/lib/studio-styles";
import { cardOccasion, isCardOccasion, type CardOccasionId } from "./occasions";

/**
 * What a gift card looks like (the owner's brief of 2026-10-31: minimal but luxurious, with the
 * variety Apple, Airbnb and Sephora give their cards). The store curates and the buyer picks.
 *
 * A design is a composition (how the card is laid out) set on a tone (the paper it is printed
 * on), both made from the store's own colours, logo and photos; the occasion gives the words and
 * at most one small mark. Five compositions on four tones are twenty designs; a store may turn
 * any off and name its signature card, and the picker shows the buyer a handful per occasion.
 */

export type Composition = "signature" | "type" | "photo" | "pattern" | "block";
export type Tone = "brand" | "black" | "cream" | "white";
export type Orientation = "portrait" | "landscape";
export type CardLanguage = "ar" | "en" | "both";
export type DesignId = `${Composition}:${Tone}`;

export const COMPOSITIONS: readonly Composition[] = [
  "signature",
  "type",
  "photo",
  "pattern",
  "block",
];
export const TONES: readonly Tone[] = ["brand", "black", "cream", "white"];

export const ALL_DESIGNS: readonly DesignId[] = COMPOSITIONS.flatMap((composition) =>
  TONES.map((tone) => `${composition}:${tone}` as DesignId),
);

export function isDesignId(value: unknown): value is DesignId {
  return typeof value === "string" && (ALL_DESIGNS as readonly string[]).includes(value);
}

export function designParts(id: DesignId): { composition: Composition; tone: Tone } {
  const [composition, tone] = id.split(":") as [Composition, Tone];
  return { composition, tone };
}

/** What a buyer chose, kept on the purchase (`gift_card_purchases.design`). */
export type CardDesign = {
  occasion: CardOccasionId;
  design: DesignId;
  orientation: Orientation;
  language: CardLanguage;
  /** Who the card is from, as written on its back. */
  from: string | null;
  /** One of the store's card photos, for a photo design. */
  photo: string | null;
  /** The buyer said they will print it as well. */
  print: boolean;
};

export const DEFAULT_DESIGN: CardDesign = {
  occasion: "gift",
  design: "signature:brand",
  orientation: "portrait",
  language: "ar",
  from: null,
  photo: null,
  print: false,
};

/** A stored design read back (an older purchase has none; a field it lacks takes the default). */
export function readDesign(value: unknown, fallbackLanguage: "ar" | "en" = "ar"): CardDesign {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    occasion: isCardOccasion(raw.occasion) ? raw.occasion : DEFAULT_DESIGN.occasion,
    design: isDesignId(raw.design) ? raw.design : DEFAULT_DESIGN.design,
    orientation: raw.orientation === "landscape" ? "landscape" : "portrait",
    language:
      raw.language === "ar" || raw.language === "en" || raw.language === "both"
        ? raw.language
        : fallbackLanguage,
    from: typeof raw.from === "string" && raw.from.trim() ? raw.from.trim().slice(0, 80) : null,
    photo: typeof raw.photo === "string" && /^https:\/\//.test(raw.photo) ? raw.photo : null,
    print: raw.print === true,
  };
}

/** The store's choices (`gift_card_settings.card_designs`). */
export type StoreDesigns = {
  off: DesignId[];
  signature: DesignId | null;
  /** Photo addresses for the photo designs, the store's chosen products or its newest. */
  photos: string[];
};

export function readStoreDesigns(value: unknown): StoreDesigns {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const off = Array.isArray(raw.off) ? raw.off.filter(isDesignId) : [];
  const photos = Array.isArray(raw.photos)
    ? raw.photos.filter((p): p is string => typeof p === "string" && /^https?:\/\//.test(p))
    : [];
  return {
    off,
    signature: isDesignId(raw.signature) && !off.includes(raw.signature) ? raw.signature : null,
    photos: photos.slice(0, 12),
  };
}

// --- Tones ------------------------------------------------------------------------------------

/** A tone's colours: the paper, its ink, a quieter ink, the flat metallic ink and the rules. */
export type Palette = {
  ground: string;
  ink: string;
  soft: string;
  metal: string;
  rule: string;
  /** The tone-on-tone pattern's line. */
  pattern: string;
  /** The store's own colour, for a colour block. */
  accent: string;
  dark: boolean;
};

/** Flat metallic inks, as a printer's proof shows foil: never a gradient. */
const GOLD_ON_DARK = "#C4A570";
const GOLD_ON_LIGHT = "#97773F";
const SOFT_BLACK = "#171615";
const WARM_WHITE = "#F3EEE6";
const NUDE = "#EEE6DB";
const PAPER_WHITE = "#FFFFFF";
const FALLBACK_ACCENT = "#3f121a";

const isHex = (value: string | null | undefined): value is string =>
  typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());

const isDark = (color: string) => contrastRatio(color, "#ffffff") > contrastRatio(color, "#000000");

function metalFor(ground: string, ink: string): string {
  const gold = isDark(ground) ? GOLD_ON_DARK : GOLD_ON_LIGHT;
  return contrastRatio(gold, ground) >= 1.9 ? gold : ink;
}

export function palette(tone: Tone, colours: StoreColours): Palette {
  const accent = isHex(colours.accent) ? colours.accent.trim() : FALLBACK_ACCENT;
  const text = isHex(colours.text) ? colours.text.trim() : null;
  let ground: string;
  let ink: string;
  if (tone === "brand") {
    ground = accent;
    ink = readableInk(ground, [WARM_WHITE, SOFT_BLACK], WARM_WHITE);
  } else if (tone === "black") {
    ground = SOFT_BLACK;
    ink = WARM_WHITE;
  } else if (tone === "cream") {
    ground = NUDE;
    ink = readableInk(ground, [accent, text], "#3A332D");
  } else {
    ground = PAPER_WHITE;
    ink = readableInk(ground, [accent, text], "#1A1A1A");
  }
  const dark = isDark(ground);
  return {
    ground,
    ink,
    soft: mixColours(ink, ground, 0.32),
    metal: metalFor(ground, ink),
    rule: mixColours(ink, ground, 0.7),
    pattern: mixColours(ground, ink, dark ? 0.13 : 0.1),
    accent,
    dark,
  };
}

// --- Which designs a buyer sees -----------------------------------------------------------------

export type VerticalKind = "fashion" | "coffee" | "food" | "services" | "beauty" | "other";

/** The store's kind of business, from its vertical's lineage (abayas are fashion, coffee food). */
export function verticalKind(lineage: readonly string[] | null | undefined): VerticalKind {
  const line = lineage ?? [];
  if (line.includes("services")) return "services";
  if (line.includes("coffee")) return "coffee";
  if (line.includes("food")) return "food";
  if (line.includes("fashion")) return "fashion";
  if (line.includes("beauty") || line.includes("jewelry")) return "beauty";
  return "other";
}

/** Which designs a kind of store shows first: abayas dark and nude, coffee photos on cream. */
const LEADS: Record<VerticalKind, DesignId[]> = {
  fashion: [
    "pattern:black",
    "type:cream",
    "signature:black",
    "photo:cream",
    "block:cream",
    "type:black",
  ],
  beauty: ["signature:black", "photo:white", "type:white", "block:white", "pattern:cream"],
  coffee: ["photo:cream", "type:cream", "signature:brand", "block:cream", "pattern:brand"],
  food: ["photo:white", "type:cream", "signature:brand", "block:cream", "pattern:cream"],
  services: ["photo:white", "signature:black", "type:cream", "block:white", "pattern:black"],
  other: ["signature:brand", "type:white", "photo:white", "pattern:cream", "block:white"],
};

/** What an occasion asks for first: the Islamic ones a pattern, a wedding type on light paper. */
const OCCASION_LEADS: Partial<Record<CardOccasionId, Composition[]>> = {
  ramadan: ["pattern", "signature"],
  eid_al_fitr: ["pattern", "type"],
  eid_al_adha: ["pattern", "type"],
  national_day: ["block", "pattern"],
  wedding: ["type", "pattern"],
  anniversary: ["type", "photo"],
  corporate: ["signature", "type"],
  birthday: ["block", "type"],
  graduation: ["block", "type"],
};

/** How many designs the picker shows for one occasion. */
export const SHOWN_PER_OCCASION = 6;

/**
 * The designs offered for an occasion: the store's signature card first, then what the occasion
 * and the store's kind lead with, then the rest, leaving out what the store turned off and photo
 * designs when it has no photo.
 */
export function designsFor({
  occasion,
  kind,
  store,
  hasPhoto,
  limit = SHOWN_PER_OCCASION,
}: {
  occasion: CardOccasionId;
  kind: VerticalKind;
  store: StoreDesigns;
  hasPhoto: boolean;
  limit?: number;
}): DesignId[] {
  const lead = OCCASION_LEADS[cardOccasion(occasion).id] ?? [];
  const byOccasion = lead.flatMap((composition) =>
    LEADS[kind].filter((id) => id.startsWith(`${composition}:`)),
  );
  const ordered = [
    ...(store.signature ? [store.signature] : []),
    ...byOccasion,
    ...LEADS[kind],
    ...ALL_DESIGNS,
  ];
  const offered: DesignId[] = [];
  for (const id of ordered) {
    if (offered.includes(id) || store.off.includes(id)) continue;
    if (!hasPhoto && id.startsWith("photo:")) continue;
    offered.push(id);
    if (offered.length >= limit) break;
  }
  return offered.length ? offered : ["signature:brand"];
}

/** The design names staff read in the settings. */
export const COMPOSITION_WORDS: Record<Composition, { ar: string; en: string }> = {
  signature: { ar: "الشعار", en: "Signature" },
  type: { ar: "خط", en: "Type" },
  photo: { ar: "صورة", en: "Photo" },
  pattern: { ar: "نقش", en: "Pattern" },
  block: { ar: "ألوان", en: "Colour block" },
};

export const TONE_WORDS: Record<Tone, { ar: string; en: string }> = {
  brand: { ar: "لون المتجر", en: "Store colour" },
  black: { ar: "أسود", en: "Black" },
  cream: { ar: "بيج", en: "Nude" },
  white: { ar: "أبيض", en: "White" },
};

export function designName(id: DesignId, lang: "ar" | "en"): string {
  const { composition, tone } = designParts(id);
  return `${COMPOSITION_WORDS[composition][lang]} · ${TONE_WORDS[tone][lang]}`;
}
