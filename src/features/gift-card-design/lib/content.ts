import type { VerticalKind } from "./design";
import type { Align, Shape } from "./geometry";
import {
  cardFontFamily,
  display,
  fitText,
  isArabic,
  type CardFamilies,
  type Measure,
} from "./type";

/**
 * The store's logo as a card draws it: its address, and the part of the picture the mark really
 * fills (its see-through margins trimmed, so the mark's own edge sits on the card's lines), with
 * that part's width over its height.
 */
export type LogoInfo = {
  href: string;
  /** Width over height of the trimmed mark. */
  aspect: number;
  /** The trimmed mark, as fractions of the picture. */
  crop: { x: number; y: number; w: number; h: number };
};

/** The fonts a store uploaded for its cards' large words, by language (their addresses). */
export type CardFontFiles = { ar: string | null; en: string | null };

/**
 * What a card says besides its design: the store, the amount and code, who it is for and from,
 * the buyer's note, and the store's kind of business, which words the card's lines (a services
 * store's card speaks of an experience, a roastery's of a cup).
 */
export type CardContent = {
  storeName: { ar: string | null; en: string | null };
  /** The store's logo when it can be set in one ink (transparent and large enough), else null. */
  logo: LogoInfo | null;
  /** How large the store's mark is drawn, as the store chose (1 as designed). */
  logoScale?: number;
  /** The families of the store's own card fonts, by language. */
  fonts?: CardFamilies;
  /** The photo a photo design shows. */
  photo: string | null;
  amount: number | null;
  currency: string;
  /** Null until the card is paid: the back shows where the code will be. */
  code: string | null;
  to: string | null;
  message: string | null;
  /** YYYY-MM-DD, or null for a card with no end date. */
  expiresOn: string | null;
  /** The store's address as people type it ("pura.boutq.store"). */
  storeLink: string;
  kind: VerticalKind;
  /** The buyer's page language, which leads a card set in both. */
  primary: "ar" | "en";
};

export function storeNameIn(content: CardContent, lang: "ar" | "en"): string {
  const { ar, en } = content.storeName;
  return ((lang === "ar" ? ar || en : en || ar) ?? "").trim();
}

/** The front's quiet line on a general gift card, by the store's kind. */
export function kindLine(kind: VerticalKind): { ar: string; en: string } | null {
  if (kind === "services") return { ar: "تجربة بانتظارك", en: "An experience awaits" };
  if (kind === "coffee") return { ar: "لفنجانك القادم", en: "For your next cup" };
  if (kind === "food") return { ar: "لذّة بانتظارك", en: "Something delicious awaits" };
  return null;
}

/** What the amount is for, on the back. */
export function spendLine(kind: VerticalKind, store: string, lang: "ar" | "en"): string {
  if (kind === "services") {
    return lang === "ar" ? `لأي تجربة في ${store}` : `Toward any experience at ${store}`;
  }
  if (kind === "coffee" || kind === "food") {
    return lang === "ar" ? `للاستمتاع بها في ${store}` : `To enjoy at ${store}`;
  }
  return lang === "ar" ? `للتسوّق من ${store}` : `To spend at ${store}`;
}

export type Box = { x: number; y: number; w: number; h: number };
/** Which edge of its box a mark keeps: the line it stands on, the one it hangs from, or neither. */
export type Anchor = "top" | "middle" | "bottom";

/**
 * A box grown or shrunk by `scale`, keeping its aligned side and its anchored edge, and never
 * wider than `maxW` (the room between the card's margins): a large mark grows to the margins and
 * stops there.
 */
export function scaledBox(
  box: Box,
  scale: number,
  align: Align,
  anchor: Anchor,
  maxW = Number.POSITIVE_INFINITY,
): Box {
  const fit = Math.min(scale, maxW / box.w);
  const w = box.w * fit;
  const h = box.h * fit;
  const x =
    align === "left" ? box.x : align === "right" ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const y =
    anchor === "top" ? box.y : anchor === "bottom" ? box.y + box.h - h : box.y + (box.h - h) / 2;
  return { x, y, w, h };
}

/** The rectangle a mark of `aspect` fills inside a box, against its aligned side and edge. */
export function fittedRect(box: Box, aspect: number, align: Align, anchor: Anchor): Box {
  const w = Math.min(box.w, box.h * aspect);
  const h = w / aspect;
  const x =
    align === "left" ? box.x : align === "right" ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const y =
    anchor === "top" ? box.y : anchor === "bottom" ? box.y + box.h - h : box.y + (box.h - h) / 2;
  return { x, y, w, h };
}

/** The height of a capital letter, as a share of the font's size (for lining up a mark's top). */
const CAP = 0.7;

/**
 * The store's mark in a box, at the store's size: its logo in one ink, or, when it has none that
 * can be set so, its name set in the display face (Latin in spaced capitals, as a wordmark is).
 * The mark keeps its box's aligned side and anchored edge, so a mark standing on the card's foot
 * line stands on it at any size; `rect` is where it was drawn, for what is set beside it.
 */
export function placedMark(
  content: CardContent,
  lang: "ar" | "en",
  box: Box,
  align: Align,
  ink: string,
  measure: Measure,
  anchor: Anchor = "middle",
  maxW = Number.POSITIVE_INFINITY,
): { shapes: Shape[]; rect: Box } {
  const scaled = scaledBox(box, content.logoScale ?? 1, align, anchor, maxW);
  if (content.logo) {
    const rect = fittedRect(scaled, content.logo.aspect, align, anchor);
    return {
      shapes: [
        { kind: "logo", href: content.logo.href, ...rect, tint: ink, crop: content.logo.crop },
      ],
      rect,
    };
  }
  const name = storeNameIn(content, lang);
  if (!name) return { shapes: [], rect: { ...scaled, w: 0, h: 0 } };
  const arabic = isArabic(name);
  const fitted = fitText(
    arabic ? name : name.toUpperCase(),
    (size) =>
      arabic
        ? display("ar", size, content.fonts)
        : { ...display("en", size, content.fonts), weight: 500, spacing: size * 0.22 },
    scaled.w,
    Math.min(scaled.h * 0.62, 9 * (content.logoScale ?? 1)),
    2,
    1,
    measure,
  );
  const size = fitted.font.size;
  const text = fitted.lines[0] ?? "";
  const x =
    align === "center"
      ? scaled.x + scaled.w / 2
      : align === "left"
        ? scaled.x
        : scaled.x + scaled.w;
  // A wordmark stands on the box's foot, hangs its capitals from its top, or sits in its middle.
  const baseline =
    anchor === "bottom"
      ? scaled.y + scaled.h
      : anchor === "top"
        ? scaled.y + size * CAP
        : scaled.y + scaled.h / 2 + size * (arabic ? 0.32 : CAP / 2);
  const width = measure(text, fitted.font);
  const left = align === "center" ? x - width / 2 : align === "left" ? x : x - width;
  return {
    shapes: [
      {
        kind: "text",
        x,
        y: baseline,
        text,
        font: fitted.font,
        fill: ink,
        align,
        dir: arabic ? "rtl" : "ltr",
      },
    ],
    rect: { x: left, y: baseline - size * CAP, w: width, h: size * CAP },
  };
}

/** The store's mark, its shapes only. */
export function storeMark(
  content: CardContent,
  lang: "ar" | "en",
  box: Box,
  align: Align,
  ink: string,
  measure: Measure,
  anchor: Anchor = "middle",
  maxW = Number.POSITIVE_INFINITY,
): Shape[] {
  return placedMark(content, lang, box, align, ink, measure, anchor, maxW).shapes;
}

/** What a particular card says: its value and code, and who it is for and from. */
export type CardDetails = {
  amount: number | null;
  code: string | null;
  to: string | null;
  message: string | null;
  expiresOn: string | null;
};

/** A card's content from the store's kit, the design's photo and the card's own details. */
export function cardContent(
  kit: {
    storeName: CardContent["storeName"];
    logo: LogoInfo | null;
    logoScale?: number;
    fonts?: CardFontFiles;
    photos: string[];
    currency: string;
    storeLink: string;
    kind: VerticalKind;
  },
  photo: string | null,
  details: CardDetails,
  primary: "ar" | "en",
): CardContent {
  return {
    storeName: kit.storeName,
    logo: kit.logo,
    logoScale: kit.logoScale ?? 1,
    fonts: {
      ar: kit.fonts?.ar ? cardFontFamily("ar", kit.fonts.ar) : null,
      en: kit.fonts?.en ? cardFontFamily("en", kit.fonts.en) : null,
    },
    photo: photo && kit.photos.includes(photo) ? photo : (kit.photos[0] ?? null),
    currency: kit.currency,
    storeLink: kit.storeLink,
    kind: kit.kind,
    primary,
    ...details,
  };
}
