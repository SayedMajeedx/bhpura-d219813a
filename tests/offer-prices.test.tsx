import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import storeOffers from "../supabase/migrations/20261027100000_store_offers.sql?raw";
import type { StoreOffer } from "../src/lib/offers";

// A store's automatic offers on a price, before checkout (the owner's decision of 2026-10-27,
// src/lib/offer-price.ts): a percentage off with no conditions strikes the price through and
// says "−26%"; any other offer that reaches the product is an "Offer" badge; free delivery is
// never a card's. The amount for one piece is the database's own (store_offer_saving, run here
// in a real Postgres against the twin), and an offer is told by when it ends.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const state = vi.hoisted(() => ({ offers: [] as StoreOffer[] }));
const storefront = vi.hoisted(() => ({
  brand: { id: "b1", slug: "pura", name_en: "Pura", primary_color: null, hero_media: null },
  settings: { storefront_design_version: 2 } as Record<string, unknown>,
  lang: "en",
  t: (_ar: string, en: string) => en,
  currency: "BHD",
  wishlist: [] as string[],
  isWishlisted: () => false,
  toggleWishlist: () => undefined,
  addToCart: () => undefined,
}));
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
  useStoreModules: () => ({}),
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("../src/hooks/use-live-offers", () => ({ useLiveOffers: () => state.offers }));
vi.mock("@/hooks/use-live-offers", () => ({ useLiveOffers: () => state.offers }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));

const { lowersThePrice, offeredCardPrice, offeredShownPrice, pieceSaving } =
  await import("../src/lib/offer-price");
const { offerCountdown } = await import("../src/lib/offers");
const { ProductCardV2 } = await import("../src/components/storefront/ProductCardV2");
const { I18nProvider } = await import("../src/lib/i18n");

const offer = (fields: Partial<StoreOffer> = {}): StoreOffer => ({
  id: fields.id ?? "o1",
  kind: "discount",
  name_ar: "",
  name_en: "",
  ends_at: null,
  min_subtotal: null,
  min_items: null,
  product_ids: [],
  category_slugs: [],
  exclude_sale_items: false,
  discount_type: "percentage",
  discount_value: 26,
  max_discount: null,
  buy_quantity: null,
  get_quantity: null,
  get_product_ids: [],
  get_category_slugs: [],
  get_percent: null,
  max_sets: null,
  local_only: true,
  ...fields,
});

const product = (variants: Array<{ selling_price: number; original_price?: number }>) => ({
  id: "p1",
  category: "abayas",
  product_variants: variants.map((v, i) => ({ id: `v${i}`, stock_main: 3, ...v })),
});

beforeEach(() => {
  state.offers = [];
});

describe("when an offer lowers a price, and when it is only a badge", () => {
  it("lowers it for a percentage off with no conditions, and only then", () => {
    expect(lowersThePrice(offer())).toBe(true);
    expect(lowersThePrice(offer({ min_subtotal: 40 }))).toBe(false);
    expect(lowersThePrice(offer({ min_items: 2 }))).toBe(false);
    expect(lowersThePrice(offer({ min_items: 1 }))).toBe(true);
    // A fixed amount comes off the order once, not off each piece.
    expect(lowersThePrice(offer({ discount_type: "fixed", discount_value: 5 }))).toBe(false);
    expect(lowersThePrice(offer({ kind: "buy_x_get_y", buy_quantity: 2, get_quantity: 1 }))).toBe(
      false,
    );
    expect(lowersThePrice(offer({ kind: "free_delivery" }))).toBe(false);
  });

  it("strikes a card's price through and says the percentage", () => {
    const p = product([{ selling_price: 160 }]);
    const shown = offeredCardPrice(p, p.product_variants, [offer()]);
    expect(shown).toMatchObject({ from: 118.4, to: 118.4, was: 160, percent: 26 });
    expect(shown.offerBadge).toEqual({ kind: "discount", percent: 26, endsAt: null });
  });

  it("strikes the price before the piece's own sale, and the order's best offer wins", () => {
    const p = product([{ selling_price: 160, original_price: 200 }]);
    const shown = offeredCardPrice(p, p.product_variants, [
      offer({ id: "small", discount_value: 10 }),
      offer({ id: "big", discount_value: 26 }),
    ]);
    expect(shown).toMatchObject({ from: 118.4, was: 200, percent: 41 });
  });

  it("leaves a piece on sale alone when the offer says so", () => {
    const p = product([{ selling_price: 160, original_price: 200 }]);
    const shown = offeredCardPrice(p, p.product_variants, [offer({ exclude_sale_items: true })]);
    expect(shown).toMatchObject({ from: 160, was: 200, percent: 20 });
    expect(shown.offerBadge).toBeNull();
  });

  it("is an Offer badge, with the price as it is, for an offer with terms", () => {
    const p = product([{ selling_price: 50 }]);
    for (const terms of [
      offer({ min_subtotal: 100 }),
      offer({ discount_type: "fixed", discount_value: 5 }),
      offer({ kind: "buy_x_get_y", buy_quantity: 2, get_quantity: 1, get_percent: 100 }),
    ]) {
      const shown = offeredCardPrice(p, p.product_variants, [terms]);
      expect(shown).toMatchObject({ from: 50, was: null });
      expect(shown.offerBadge?.kind).toBe("offer");
    }
  });

  it("wears no badge for free delivery, nor an offer on other products", () => {
    const p = product([{ selling_price: 50 }]);
    expect(
      offeredCardPrice(p, p.product_variants, [offer({ kind: "free_delivery", min_subtotal: 30 })])
        .offerBadge,
    ).toBeNull();
    expect(
      offeredCardPrice(p, p.product_variants, [offer({ product_ids: ["other"] })]).offerBadge,
    ).toBeNull();
    expect(
      offeredCardPrice(p, p.product_variants, [offer({ category_slugs: ["abayas"] })]).from,
    ).toBe(37);
  });

  it("caps a piece's saving by the offer's most", () => {
    expect(pieceSaving(offer({ discount_value: 50, max_discount: 10 }), 100)).toBe(10);
    expect(pieceSaving(offer({ discount_value: 33.333 }), 9.99)).toBe(3.33);
  });

  it("shows the product page's price lowered, a range too, and when the offer ends", () => {
    const shown = offeredShownPrice(
      [offer({ ends_at: "2026-11-07T15:08:00Z" })],
      { id: "p1" },
      {
        price: 100,
        was: 0,
        min: 100,
        max: 200,
        isRange: true,
      },
    );
    expect(shown).toEqual({
      price: 74,
      min: 74,
      max: 148,
      was: 100,
      percent: 26,
      endsAt: "2026-11-07T15:08:00Z",
    });
    expect(
      offeredShownPrice(
        [offer({ min_subtotal: 40 })],
        { id: "p1" },
        {
          price: 100,
          was: 0,
          min: 100,
          max: 100,
          isRange: false,
        },
      ),
    ).toBeNull();
  });

  it("says when an offer ends, closer as it nears", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const ends = (iso: string | null, lang: "ar" | "en") =>
      offerCountdown({ ends_at: iso }, lang, now);
    expect(ends("2026-10-27T20:00:00Z", "en")).toBe("Ends today");
    expect(ends("2026-10-28T20:00:00Z", "ar")).toBe("ينتهي غدًا");
    expect(ends("2026-10-30T11:00:00Z", "en")).toBe("Ends in 3 days");
    expect(ends("2026-10-30T11:00:00Z", "ar")).toBe("ينتهي خلال 3 أيام");
    expect(ends("2026-11-20T11:00:00Z", "en")).toBe("Until 20 Nov");
    expect(ends(null, "en")).toBeNull();
  });
});

describe("one piece's saving is the database's", () => {
  it("matches store_offer_saving over many prices, percentages and caps", async () => {
    const db = new PGlite();
    const rule = storeOffers.slice(
      storeOffers.indexOf("CREATE OR REPLACE FUNCTION public.store_offer_reaches"),
      storeOffers.indexOf("-- What a cart gets from the store's live offers"),
    );
    await db.exec(rule);
    const cases: Array<[number, number, number | null]> = [];
    for (const price of [0.5, 1, 9.99, 12.345, 160, 999.999]) {
      for (const pct of [1, 10, 26, 33.333, 50, 99, 100]) {
        for (const cap of [null, 0.1, 5, 1000]) cases.push([price, pct, cap]);
      }
    }
    for (const [price, pct, cap] of cases) {
      const o = offer({ discount_value: pct, max_discount: cap });
      const sql = await db.query<{ s: string }>(
        "SELECT public.store_offer_saving($1::jsonb, $2::jsonb) AS s",
        [
          JSON.stringify(o),
          JSON.stringify([
            { product_id: "p1", category: null, quantity: 1, line_total: price, on_sale: false },
          ]),
        ],
      );
      expect(pieceSaving(o, price)).toBeCloseTo(Number(sql.rows[0].s), 3);
    }
  });
});

describe("a card in the store", () => {
  const withQuery = (node: React.ReactNode) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>{node}</I18nProvider>
      </QueryClientProvider>,
    );
  const card = {
    id: "p1",
    name: "Abaya",
    name_en: "Abaya",
    category: "abayas",
    image_url: null,
    product_variants: [{ id: "v1", selling_price: 160, stock_main: 3 }],
  };

  it("shows the lowered price, the struck price and the percentage", () => {
    localStorage.setItem("lang", "en");
    state.offers = [offer()];
    withQuery(<ProductCardV2 product={card as never} />);
    expect(screen.getByText(/118\.400/)).toBeInTheDocument();
    expect(screen.getByText(/160\.000/)).toHaveClass("line-through");
    // In the store's own badge colour (Settings → Palette), never the error red.
    expect(screen.getByText("-26%").className).toContain("--badge-accent-bg");
    expect(screen.getByText("-26%")).not.toHaveClass("bg-destructive");
  });

  it("wears Offer, with its price as it is, for an offer with terms", () => {
    localStorage.setItem("lang", "en");
    state.offers = [offer({ min_subtotal: 300 })];
    withQuery(<ProductCardV2 product={card as never} />);
    expect(screen.getByText(/160\.000/)).not.toHaveClass("line-through");
    expect(screen.getByText("Offer")).toBeInTheDocument();
  });
});
