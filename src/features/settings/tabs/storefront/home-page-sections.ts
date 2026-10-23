import { promoCardsToShow } from "@/features/storefront-home/lib/home-products";

/**
 * The storefront's home page, section by section, in the order a shopper scrolls it
 * (`src/routes/$slug.index.tsx`). Its settings were in four groups: the trust bar's switch and
 * place with the "new look" options and its badges with the footer, the brand story's switch and
 * picture with the new look and its words with the hero, and a section's switch both beside its
 * title and in the banners editor. Each section is now one row that holds all of it.
 */

export type HomeSectionId =
  | "hero"
  | "trust_bar"
  | "promo_cards"
  | "new"
  | "best"
  | "sale"
  | "trending"
  | "brand_story"
  | "recently_viewed"
  | "category_pages";

/** The sections a store's home page has; the brand story is drawn by the new look only. */
export function homePageSections(isV2: boolean): HomeSectionId[] {
  return [
    "hero",
    "trust_bar",
    "promo_cards",
    "new",
    "best",
    "sale",
    "trending",
    ...(isV2 ? (["brand_story", "recently_viewed"] as const) : (["recently_viewed"] as const)),
    "category_pages",
  ];
}

type Settings = Record<string, unknown>;

type Editorial = { enabled?: boolean } | undefined;

const editorialOf = (bs: Settings, kind: "best" | "sale" | "trending"): Editorial => {
  const all = bs.homepage_editorial_sections;
  if (!all || typeof all !== "object") return undefined;
  return (all as Record<string, Editorial>)[kind];
};

/**
 * Whether a section is shown, as the storefront decides it (`publicSettingsFromPageData`,
 * `$slug.index.tsx`): on unless switched off. Null for a section without a switch.
 */
export function homeSectionOn(id: HomeSectionId, bs: Settings): boolean | null {
  switch (id) {
    case "trust_bar": {
      // Hidden by either: the bar's switch, or the badges' own flag (an older second switch).
      const badges = bs.trust_badges as { enabled?: boolean } | null | undefined;
      return bs.trust_bar_enabled !== false && badges?.enabled !== false;
    }
    case "new":
      return bs.show_new_arrivals !== false;
    case "best":
      return editorialOf(bs, "best")?.enabled ?? bs.show_best_sellers !== false;
    case "sale":
    case "trending":
      return editorialOf(bs, id)?.enabled !== false;
    case "brand_story":
      return bs.brand_story_enabled !== false;
    case "recently_viewed":
      return bs.recently_viewed_enabled !== false;
    default:
      return null;
  }
}

const promoCards = (bs: Settings) =>
  (Array.isArray(bs.home_promo_cards) ? bs.home_promo_cards.slice(0, 4) : []).map((card) =>
    card && typeof card === "object" ? (card as Settings) : null,
  );

/** The promo cards the storefront shows: the storefront's own rule (`promoCardsToShow`). */
export function filledPromoCards(bs: Settings): number {
  return promoCardsToShow(promoCards(bs) as { image_url?: string }[]).length;
}

/**
 * Cards the store started (a link or a colour) that show nothing, having no picture and no
 * title: Pura had two (with two more holding only a colour), and its home page drew an empty band
 * where they would be.
 */
export function startedPromoCards(bs: Settings): number {
  const shown = new Set(promoCardsToShow(promoCards(bs) as { image_url?: string }[]));
  return promoCards(bs).filter(
    (card) =>
      card &&
      !shown.has(card as { image_url?: string }) &&
      typeof card.href === "string" &&
      card.href.trim().length > 0,
  ).length;
}

/**
 * A services store's home page (`ServicesHome`: a store whose catalog is only services), in the
 * order a shopper scrolls it. None of the shop's sections show there (no new arrivals, best
 * sellers or trust bar), so its settings list these instead, each saying where it is edited.
 */
export type ServicesHomeSectionId =
  "hero" | "booking_invite" | "offers" | "gallery" | "reviews" | "faq" | "category_pages";

export const SERVICES_HOME_SECTIONS: readonly ServicesHomeSectionId[] = [
  "hero",
  "booking_invite",
  "offers",
  "gallery",
  "reviews",
  "faq",
  "category_pages",
];
