import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { StoreOffer } from "../src/lib/offers";

// Offers by the kind of piece, chosen from a partner shop's products (the owner's request of
// 2026-11-14: Pura's partner shop put some ready pieces on sale, and the store wanted the same
// price online, never on a piece tailored to the customer). The rule itself is the database's
// (tests/offers-by-kind-of-piece-migration.test.ts); here, the twins a shopper reads and the
// Discounts page's choice.

const state = vi.hoisted(() => ({
  create: vi.fn(async (..._args: unknown[]) => undefined),
}));

const offersData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  offersQueries: {
    list: () => ({ queryKey: ["offers-list"], queryFn: async () => [] }),
    combine: () => ({ queryKey: ["offers-combine"], queryFn: async () => "best" }),
  },
  createStoreOffer: state.create,
  updateStoreOffer: vi.fn(),
  deleteStoreOffer: vi.fn(),
  saveOffersCombine: vi.fn(),
  invalidateStoreOffers: async () => undefined,
});
vi.mock("../src/lib/data/offers", (io) => offersData(io));
vi.mock("@/lib/data/offers", (io) => offersData(io));
const catalogData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  catalogQueries: {
    products: () => ({
      queryKey: ["products"],
      queryFn: async () => [
        { id: "athar", name: "Athar", name_en: "Athar", is_made_to_order: true },
        { id: "wtar", name: "Wtar", name_en: "Wtar", is_made_to_order: true },
        { id: "nasaq", name: "Nasaq", name_en: "Nasaq", is_made_to_order: true },
      ],
    }),
  },
});
vi.mock("../src/lib/data/catalog", (io) => catalogData(io));
vi.mock("@/lib/data/catalog", (io) => catalogData(io));
const categoryData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  categoriesQueries: { active: () => ({ queryKey: ["categories"], queryFn: async () => [] }) },
});
vi.mock("../src/lib/data/categories", (io) => categoryData(io));
vi.mock("@/lib/data/categories", (io) => categoryData(io));
const stockAt = (incubator: string, product: string, quantity: number) => ({
  incubator_id: incubator,
  quantity,
  product_variants: { products: { id: product } },
});
const incubatorData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  incubatorsQueries: {
    active: () => ({
      queryKey: ["partners"],
      queryFn: async () => [
        { id: "lulwa", name: "Dar Lulwa" },
        { id: "empty", name: "Empty shop" },
      ],
    }),
    inventory: () => ({
      queryKey: ["partner-stock"],
      queryFn: async () => [
        stockAt("lulwa", "athar", 1),
        stockAt("lulwa", "wtar", 1),
        stockAt("empty", "nasaq", 0),
      ],
    }),
  },
});
vi.mock("../src/lib/data/incubators", (io) => incubatorData(io));
vi.mock("@/lib/data/incubators", (io) => incubatorData(io));
vi.mock("../src/hooks/use-store-currency", () => ({ useStoreCurrency: () => "BHD" }));
vi.mock("@/hooks/use-store-currency", () => ({ useStoreCurrency: () => "BHD" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { StoreOffersSection } = await import("../src/features/offers/components/StoreOffersSection");
const { partnersHolding, withShown } = await import("../src/features/offers/lib/partner-pick");
const { offerReaches, offerTerms } = await import("../src/lib/offers");
const { offeredCardPrice, offeredShownPrice, pieceMadeToOrder } =
  await import("../src/lib/offer-price");
const { formFromRow, rowFromForm, emptyOfferForm } =
  await import("../src/features/offers/lib/offer-form");

const offer = (fields: Partial<StoreOffer> = {}): StoreOffer => ({
  id: "o1",
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
  discount_value: 30,
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
const money = (n: number) => `BHD ${n.toFixed(3)}`;
const athar = { id: "athar", category: "abayas", is_made_to_order: true };
const ready = { selling_price: 28, stock_main: 0, stock_incubator: 1 };
const tailoredOnly = { selling_price: 28, stock_main: 0, stock_incubator: 0 };

describe("an offer for one kind of piece, as a shopper reads it", () => {
  it("reaches a ready piece, never one made to order, and is not held against an unknown one", () => {
    const partner = offer({ pieces: "ready" });
    expect(offerReaches(partner, { id: "athar", madeToOrder: false })).toBe(true);
    expect(offerReaches(partner, { id: "athar", madeToOrder: true })).toBe(false);
    expect(offerReaches(partner, { id: "athar" })).toBe(true);
    expect(offerReaches(offer({ pieces: "made_to_order" }), { id: "a", madeToOrder: false })).toBe(
      false,
    );
  });

  it("says which pieces in its terms, in both languages", () => {
    expect(offerTerms(offer({ pieces: "ready" }), "en", money)).toBe(
      "30% off on ready-made pieces",
    );
    expect(offerTerms(offer({ pieces: "ready", min_subtotal: 40 }), "ar", money)).toBe(
      "خصم 30% على القطع الجاهزة للطلبات من BHD 40.000",
    );
    expect(offerTerms(offer(), "en", money)).toBe("30% off");
  });

  it("strikes a card's price only for a size with a ready piece", () => {
    const partner = [offer({ pieces: "ready", product_ids: ["athar"] })];
    expect(pieceMadeToOrder(athar, ready)).toBe(false);
    expect(pieceMadeToOrder(athar, tailoredOnly)).toBe(true);
    expect(offeredCardPrice(athar, [ready], partner)).toMatchObject({ from: 19.6, percent: 30 });
    expect(offeredCardPrice(athar, [tailoredOnly], partner)).toMatchObject({
      from: 28,
      percent: null,
    });
  });

  it("follows the product page's choice: ready-made, then tailored", () => {
    const partner = [offer({ pieces: "ready" })];
    const shown = { price: 28, was: 0, min: 28, max: 28, isRange: false };
    expect(offeredShownPrice(partner, athar, { ...shown, madeToOrder: false })).toMatchObject({
      price: 19.6,
    });
    expect(offeredShownPrice(partner, athar, { ...shown, madeToOrder: true })).toBeNull();
  });
});

describe("choosing products by the partner shop that holds them", () => {
  it("lists the partner shops holding a piece now, each with its products", () => {
    const partners = partnersHolding(
      [
        { id: "lulwa", name: "Dar Lulwa" },
        { id: "empty", name: "Empty shop" },
      ],
      [stockAt("lulwa", "athar", 1), stockAt("lulwa", "athar", 2), stockAt("empty", "nasaq", 0)],
    );
    expect(partners).toEqual([{ id: "lulwa", name: "Dar Lulwa", productIds: ["athar"] }]);
    expect(withShown(["nasaq"], ["athar", "wtar"], true)).toEqual(["nasaq", "athar", "wtar"]);
    expect(withShown(["nasaq", "athar"], ["athar", "wtar"], false)).toEqual(["nasaq"]);
  });

  it("keeps the kind of piece through the form, and none for free delivery", () => {
    const form = { ...emptyOfferForm("discount"), pieces: "ready" as const };
    expect(rowFromForm(form).pieces).toBe("ready");
    expect(rowFromForm({ ...form, kind: "free_delivery" }).pieces).toBe("any");
    const saved = rowFromForm(form) as Parameters<typeof formFromRow>[0];
    expect(formFromRow({ ...saved, pieces: "weird" }).pieces).toBe("any");
  });

  it("picks Dar Lulwa's products, unticks one, and saves an offer on ready pieces", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoreOffersSection brandId="b1" isAr={false} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /New offer/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Chosen products or categories" }));
    // Only a partner holding a piece is offered.
    expect(within(dialog).queryByRole("button", { name: /Empty shop/ })).toBeNull();
    fireEvent.click(await within(dialog).findByRole("button", { name: "At Dar Lulwa (2)" }));
    expect(within(dialog).queryByText("Nasaq")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Select those shown (2)" }));
    // A partner shop's pieces are ready-made: the offer turns to them by itself.
    expect(
      within(dialog)
        .getByRole("button", { name: /Ready-made pieces only/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Wtar" }));
    expect(within(dialog).getByText(/Shoppers read: 10% off on ready-made pieces/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save offer" }));
    await waitFor(() =>
      expect(state.create).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ kind: "discount", product_ids: ["athar"], pieces: "ready" }),
      ),
    );
  });
});
