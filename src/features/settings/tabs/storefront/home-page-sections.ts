import { promoCardsToShow } from "@/features/storefront-home/lib/home-products";
import type { Json } from "@/integrations/supabase/types";

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

/** The sections a store's home page has, in the order a shopper scrolls them. */
export function homePageSections(): HomeSectionId[] {
  return [
    "hero",
    "trust_bar",
    "promo_cards",
    "new",
    "best",
    "sale",
    "trending",
    "brand_story",
    "recently_viewed",
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

/**
 * The badges as the trust bar's one switch leaves them when it turns the bar on: their older flag
 * (`trust_badges.enabled`), which hid the bar too, cleared. The switch writes `trust_bar_enabled`
 * itself, and these only when turning on.
 */
export function trustBadgesTurnedOn(bs: Settings): { [key: string]: Json | undefined } {
  const badges =
    bs.trust_badges && typeof bs.trust_badges === "object" && !Array.isArray(bs.trust_badges)
      ? (bs.trust_badges as { [key: string]: Json | undefined })
      : {};
  return { items: [], ...badges, enabled: true };
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
 * order a shopper scrolls it. Of the shop's sections only the trust bar shows there (no new
 * arrivals or best sellers), so its settings list these instead, each saying where it is edited.
 */
export type ServicesHomeSectionId =
  | "hero"
  | "trust_bar"
  | "booking_invite"
  | "offers"
  | "gallery"
  | "reviews"
  | "faq"
  | "category_pages";

export const SERVICES_HOME_SECTIONS: readonly ServicesHomeSectionId[] = [
  "hero",
  "trust_bar",
  "booking_invite",
  "offers",
  "gallery",
  "reviews",
  "faq",
  "category_pages",
];
