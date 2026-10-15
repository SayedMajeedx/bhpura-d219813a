import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Pura's home page showed a bare band under the hero (found 2026-10-15): the area that holds the
// promo cards and the new arrivals was drawn with its background and padding while both had
// nothing to show (four cards with a link or a colour and no picture or title; new arrivals off).
// The area is left out when it has nothing, and the settings say why the cards do not show.

const storefront = vi.hoisted(() => ({
  settings: { home_promo_cards: [] as unknown[] },
  lang: "en",
}));
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));

const { promoAreaShows, promoCardsToShow } =
  await import("../src/features/storefront-home/lib/home-products");
const { PromoCards } = await import("../src/features/storefront-home/components/PromoCards");
const { filledPromoCards, startedPromoCards } =
  await import("../src/features/settings/tabs/storefront/home-page-sections");

// Pura's four cards, as stored.
const puraCards = [
  { href: "https://pura.boutq.store/pura/abayas", image_url: "", title_ar: "", title_en: "" },
  { href: "https://pura.boutq.store/pura/dresses", image_url: "", title_ar: "", title_en: "" },
  { href: "", image_url: "", title_ar: "", title_en: "", background_color: "#f4f4f4" },
  { href: "", image_url: "", title_ar: "", title_en: "", background_color: "#f4f4f4" },
];

describe("the promo cards", () => {
  it("show only with a picture or a title, a blank title counting as none", () => {
    expect(promoCardsToShow(puraCards)).toEqual([]);
    expect(
      promoCardsToShow([{ image_url: "a.jpg" }, { title_ar: " " }, { title_en: "Eid" }, null]),
    ).toHaveLength(2);
  });

  it("draw nothing when none shows", () => {
    storefront.settings = { home_promo_cards: puraCards };
    const { container } = render(<PromoCards />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the area under the hero", () => {
  const base = {
    cards: puraCards,
    showNewArrivals: false,
    newest: [{ id: "p1" }],
    activeCat: null,
  };

  it("is left out with no card that shows and the new arrivals off (Pura)", () => {
    expect(promoAreaShows(base)).toBe(false);
  });

  it("shows with a card that shows, or the new arrivals on with a product", () => {
    expect(promoAreaShows({ ...base, cards: [{ image_url: "a.jpg" }] })).toBe(true);
    expect(promoAreaShows({ ...base, showNewArrivals: true })).toBe(true);
  });

  it("is left out when the new arrivals have no product, or a category is chosen", () => {
    expect(promoAreaShows({ ...base, showNewArrivals: true, newest: [] })).toBe(false);
    expect(promoAreaShows({ ...base, showNewArrivals: true, activeCat: "abayas" })).toBe(false);
  });
});

describe("the Home page settings", () => {
  it("count cards with the storefront's rule and name the ones that show nothing", () => {
    expect(filledPromoCards({ home_promo_cards: puraCards })).toBe(0);
    expect(startedPromoCards({ home_promo_cards: puraCards })).toBe(2);
    expect(startedPromoCards({ home_promo_cards: [{ href: "/x", image_url: "a.jpg" }] })).toBe(0);
  });
});
