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
// A card is a link to where the store points it; the router is not needed to read the card.
const linkModule = vi.hoisted(() => () => ({
  StorefrontLink: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../src/features/storefront-home/components/StorefrontLink", linkModule);
vi.mock("@/features/storefront-home/components/StorefrontLink", linkModule);

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

  it("draw a designed banner as it is, and shade only a card's own words", () => {
    // Pura's two banners carry their words in the picture: the shade dimmed their left side.
    storefront.settings = {
      home_promo_cards: [
        { image_url: "https://media.boutq.store/gift-cards.jpg", href: "/pura/gift-cards" },
        { image_url: "https://media.boutq.store/eid.jpg", title_en: "Eid edit" },
      ],
    };
    const { getAllByTestId, getByText } = render(<PromoCards />);
    expect(getAllByTestId("promo-card-shade")).toHaveLength(1);
    expect(getByText("Eid edit").closest("a")).toContainElement(
      getAllByTestId("promo-card-shade")[0],
    );
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

describe("on a phone", () => {
  it("lays two cards or more in one sideways row, the next card peeking, and one card whole", () => {
    // Stacked, Pura's two banners took 400px of a phone and the first product fell below the
    // first screen (2026-11-13).
    storefront.settings = {
      home_promo_cards: [{ image_url: "a.jpg" }, { image_url: "b.jpg" }],
    };
    const { getByTestId, getAllByRole, unmount } = render(<PromoCards />);
    expect(getByTestId("promo-cards").className).toMatch(/\bflex\b.*snap-x/);
    expect(getByTestId("promo-cards").className).toContain("sm:grid");
    for (const card of getAllByRole("link")) expect(card.className).toContain("w-[86%]");
    unmount();
    storefront.settings = { home_promo_cards: [{ image_url: "a.jpg" }] };
    const one = render(<PromoCards />);
    expect(one.getByTestId("promo-cards").className).not.toContain("snap-x");
  });
});

// PageSpeed, 2026-11-14 (Pura's phone run): the first card's picture was preloaded at the hero's
// own top priority, fetched at 960px for a card drawn 568px wide, and the two designed banners
// were both read as "Special offer" though they lead to different pages.
const { promoCardLabel, promoCardSizes } =
  await import("../src/features/storefront-home/lib/promo-cards");

describe("what the promo cards ask of the network", () => {
  it("leave the top priority to the hero, and fetch the card's own width", () => {
    storefront.settings = {
      home_promo_cards: [{ image_url: "https://media.boutq.store/a.jpg" }, { image_url: "b.jpg" }],
    };
    const { container, unmount } = render(<PromoCards />);
    const [first, second] = Array.from(container.querySelectorAll("img"));
    expect(first.getAttribute("loading")).toBe("eager");
    expect(first.getAttribute("fetchpriority")).not.toBe("high");
    expect(first.getAttribute("decoding")).toBe("async");
    expect(second.getAttribute("loading")).toBe("lazy");
    expect(first.getAttribute("sizes")).toBe(promoCardSizes(2));
    unmount();
  });

  it("say how wide a card is drawn: 86% of a phone in a row, the whole phone alone, half above", () => {
    expect(promoCardSizes(2)).toBe("(min-width: 1280px) 616px, (min-width: 640px) 50vw, 86vw");
    expect(promoCardSizes(1)).toBe("(min-width: 1280px) 616px, (min-width: 640px) 50vw, 100vw");
  });
});

describe("a promo card's name, when its words are in its picture", () => {
  const categories = [{ slug: "abayas", name_ar: "عبايات", name_en: "Abayas" }];
  const options = { lang: "ar" as const, slug: "pura", categories };

  it("is where it leads, in the shopper's language", () => {
    const name = (href: string, lang: "ar" | "en" = "ar") =>
      promoCardLabel({ href, hasWords: false }, { ...options, lang });
    expect(name("/pura/all")).toBe("كل المنتجات");
    expect(name("/pura/gift-cards")).toBe("بطاقات الهدايا");
    expect(name("/pura/gift-cards", "en")).toBe("Gift cards");
    expect(name("https://pura.boutq.store/pura/abayas")).toBe("عبايات");
    expect(name("/pura/abayas", "en")).toBe("Abayas");
    expect(name("#products")).toBe("المنتجات");
    expect(name("")).toBe("المنتجات");
    // Another site's page, or a page it does not know, keeps the word it had.
    expect(name("https://instagram.com/pura")).toBe("عرض خاص");
    expect(name("/pura/somewhere-else", "en")).toBe("Special offer");
  });

  it("is a services store's own word for the whole listing", () => {
    const label = promoCardLabel(
      { href: "/aurora/all", hasWords: false },
      { lang: "en", slug: "aurora", servicesStore: true },
    );
    expect(label).toBe("All services");
  });

  it("is left to the card's own words when it has them", () => {
    expect(promoCardLabel({ href: "/pura/all", hasWords: true }, options)).toBeUndefined();
  });

  it("differs for Pura's two banners on the page", () => {
    Object.assign(storefront, { brand: { slug: "pura" }, initialCategories: categories });
    storefront.lang = "ar";
    storefront.settings = {
      home_promo_cards: [
        { image_url: "a.jpg", href: "/pura/all" },
        { image_url: "b.jpg", href: "/pura/gift-cards" },
      ],
    };
    const { getAllByRole, unmount } = render(<PromoCards />);
    expect(getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
      "كل المنتجات",
      "بطاقات الهدايا",
    ]);
    unmount();
    storefront.lang = "en";
  });
});
