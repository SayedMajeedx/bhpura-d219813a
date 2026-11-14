import { smartKindOf, smartName } from "@/features/storefront-shell/lib/category-head";

type Lang = "ar" | "en";

type CategoryName = {
  slug?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
};

const PAGE_NAMES: Record<string, { ar: string; en: string }> = {
  "gift-cards": { ar: "بطاقات الهدايا", en: "Gift cards" },
  book: { ar: "احجز موعدك", en: "Book an appointment" },
  "track-order": { ar: "تتبع طلبك", en: "Track your order" },
};

const PRODUCTS = { ar: "المنتجات", en: "Products" };
const SPECIAL_OFFER = { ar: "عرض خاص", en: "Special offer" };

/**
 * How wide a promo card's picture is drawn, so the browser fetches the width it shows. From 640px
 * the cards are two columns of the page's 1280px box; below it two cards or more are one sideways
 * row of cards 86% wide, and one card fills the row. "100vw" on a phone fetched a 960px picture for
 * a card drawn 568px wide (PageSpeed, 2026-11-14).
 */
export function promoCardSizes(cardCount: number): string {
  const phone = cardCount > 1 ? "86vw" : "100vw";
  return `(min-width: 1280px) 616px, (min-width: 640px) 50vw, ${phone}`;
}

/**
 * The name a screen reader gives a promo card that shows no words of its own (a designed banner
 * whose words are in its picture): where it leads, in the shopper's language. Every such card was
 * "Special offer", so two cards leading to different pages had one name (PageSpeed, 2026-11-14).
 * A card with a title or a line under it is named by them, so this returns nothing for it.
 */
export function promoCardLabel(
  card: { href?: string | null; hasWords: boolean },
  options: { lang: Lang; slug: string; categories?: CategoryName[]; servicesStore?: boolean },
): string | undefined {
  if (card.hasWords) return undefined;
  const { lang, slug, categories = [], servicesStore = false } = options;
  const segment = lastSegment(card.href, slug);
  if (segment === null) return PRODUCTS[lang];
  const category = categories.find((c) => c.slug === segment);
  if (category) {
    const name = lang === "ar" ? category.name_ar || category.name_en : category.name_en;
    if (name) return name;
  }
  const kind = smartKindOf(segment);
  if (kind) return smartName(kind, lang, servicesStore);
  return PAGE_NAMES[segment]?.[lang] ?? SPECIAL_OFFER[lang];
}

/** The page a card's link opens, after the store's own part of the address; null for the products. */
function lastSegment(href: string | null | undefined, slug: string): string | null {
  const raw = (href ?? "").trim();
  if (!raw || raw.startsWith("#")) return null;
  let parts: string[];
  try {
    const url = new URL(raw, "https://store.invalid");
    // Another site's page (an Instagram post, say) is no page of the store's.
    if (url.hostname !== "store.invalid" && !url.hostname.endsWith("boutq.store")) return "";
    parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    return "";
  }
  if (parts[0] === slug) parts.shift();
  return parts.length ? parts[parts.length - 1] : null;
}
