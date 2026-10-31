import type { VerticalKind } from "./design";
import type { Align, Shape } from "./geometry";
import { display, fitText, isArabic, type Measure } from "./type";

/**
 * What a card says besides its design: the store, the amount and code, who it is for and from,
 * the buyer's note, and the store's kind of business, which words the card's lines (a services
 * store's card speaks of an experience, a roastery's of a cup).
 */
export type CardContent = {
  storeName: { ar: string | null; en: string | null };
  /** The store's logo when it can be set in one ink (transparent and large enough), else null. */
  logo: string | null;
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

/**
 * The store's mark in a box: its logo in one ink, or, when it has none that can be set so, its
 * name set in the display face (Latin in spaced capitals, as a wordmark is).
 */
export function storeMark(
  content: CardContent,
  lang: "ar" | "en",
  box: { x: number; y: number; w: number; h: number },
  align: Align,
  ink: string,
  measure: Measure,
): Shape[] {
  if (content.logo) return [{ kind: "logo", href: content.logo, ...box, tint: ink, align }];
  const name = storeNameIn(content, lang);
  if (!name) return [];
  const arabic = isArabic(name);
  const fitted = fitText(
    arabic ? name : name.toUpperCase(),
    (size) =>
      arabic ? display("ar", size) : { ...display("en", size), weight: 500, spacing: size * 0.22 },
    box.w,
    Math.min(box.h * 0.62, 9),
    2,
    1,
    measure,
  );
  const x = align === "center" ? box.x + box.w / 2 : align === "left" ? box.x : box.x + box.w;
  const baseline = box.y + box.h / 2 + fitted.font.size * (arabic ? 0.32 : 0.34);
  return [
    {
      kind: "text",
      x,
      y: baseline,
      text: fitted.lines[0] ?? "",
      font: fitted.font,
      fill: ink,
      align,
      dir: arabic ? "rtl" : "ltr",
    },
  ];
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
    logo: string | null;
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
    photo: photo && kit.photos.includes(photo) ? photo : (kit.photos[0] ?? null),
    currency: kit.currency,
    storeLink: kit.storeLink,
    kind: kit.kind,
    primary,
    ...details,
  };
}
