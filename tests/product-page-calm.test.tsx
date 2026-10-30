import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductPurchaseActions } from "../src/features/product-page/components/ProductPurchaseActions";
import { ProductTitleAndPrice } from "../src/features/product-page/components/ProductTitleAndPrice";
import { descriptionAboveOptions } from "../src/features/product-page/lib/product-details";
import { lowStockLine } from "../src/features/product-page/lib/stock-line";
import { productDeliveryLine } from "../src/features/product-page/lib/delivery-line";

// The product page says what helps a shopper choose, once and where they decide: the description
// once (the new look's accordion holds it), "nearly gone" only at the store's own low-stock level,
// and the delivery time beside the price.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../src/hooks/use-live-offers", () => ({ useLiveOffers: () => [] }));
vi.mock("@/hooks/use-live-offers", () => ({ useLiveOffers: () => [] }));
vi.mock("../src/components/storefront/CurrencySwitcher", () => ({ ApproxPrice: () => null }));
vi.mock("@/components/storefront/CurrencySwitcher", () => ({ ApproxPrice: () => null }));
vi.mock("../src/components/storefront/ProductShareModal", () => ({
  ProductShareModal: () => null,
}));
vi.mock("@/components/storefront/ProductShareModal", () => ({ ProductShareModal: () => null }));
vi.mock("../src/features/product-page/components/ProductOffers", () => ({
  ProductOffers: () => null,
}));
vi.mock("@/features/product-page/components/ProductOffers", () => ({ ProductOffers: () => null }));

const estimates = {
  storefront_mode: "shop",
  delivery_estimate_enabled: true,
  delivery_estimate_en: "Delivery in 2 days",
  delivery_estimate_ar: "التوصيل خلال يومين",
  delivery_estimate_tailored_en: "Made in 10 days",
  delivery_estimate_tailored_ar: "التجهيز خلال 10 أيام",
};

describe("the description", () => {
  it("is drawn above the options only on the classic look, which has no accordion", () => {
    expect(descriptionAboveOptions(2)).toBe(false);
    expect(descriptionAboveOptions(1)).toBe(true);
    expect(descriptionAboveOptions(undefined)).toBe(true);
  });
});

describe("the low-stock line", () => {
  it("counts the pieces left in the shopper's language, at the store's level or fewer", () => {
    expect(lowStockLine(1, 5, "ar")).toBe("باقي قطعة واحدة فقط");
    expect(lowStockLine(2, 5, "ar")).toBe("باقي قطعتان فقط");
    expect(lowStockLine(3, 5, "ar")).toBe("باقي 3 قطع فقط");
    expect(lowStockLine(1, 5, "en")).toBe("Only 1 piece left");
    expect(lowStockLine(4, 5, "en")).toBe("Only 4 pieces left");
  });

  it("says nothing above the level, at none, or when the store turned the warning off", () => {
    expect(lowStockLine(6, 5, "ar")).toBeNull();
    expect(lowStockLine(0, 5, "ar")).toBeNull();
    expect(lowStockLine(2, 0, "en")).toBeNull();
    // A boutique with one piece per size sets 1: two pieces are not "nearly gone".
    expect(lowStockLine(2, 1, "en")).toBeNull();
  });

  const actions = (over: { stock?: number; level?: number; tailoring?: boolean } = {}) =>
    render(
      <ProductPurchaseActions
        {...({
          brand: {},
          doAdd: vi.fn(),
          errorMsg: null,
          inquiryUrl: null,
          isTailoringActive: over.tailoring ?? false,
          lang: "en",
          maxStock: over.stock ?? 3,
          product: { id: "p1", is_made_to_order: over.tailoring ?? false },
          qty: 1,
          selectedVariantOutOfStock: false,
          setQty: vi.fn(),
          settings: { storefront_mode: "shop", low_stock_threshold: over.level },
          t: (_ar: string, en: string) => en,
          variant: { id: "v1", stock_main: over.stock ?? 3 },
          vocabulary: {},
        } as never)}
      />,
    );

  it("is a quiet line, not a pulsing flame, and never tells a visitor the stock", () => {
    actions({ stock: 3, level: 5 });
    const line = screen.getByRole("status");
    expect(line.textContent).toBe("Only 3 pieces left");
    expect(line.className).not.toMatch(/animate-pulse/);
    expect(document.body.textContent).not.toMatch(/🔥/);

    actions({ stock: 47, level: 5 });
    expect(document.body.textContent).not.toMatch(/47|available/);
  });

  it("follows the store's level, not the number 5", () => {
    actions({ stock: 8, level: 10 });
    expect(screen.getByRole("status").textContent).toBe("Only 8 pieces left");
  });

  it("leaves a made-to-order piece to its own badge", () => {
    actions({ stock: 2, level: 5, tailoring: true });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Made to order")).toBeTruthy();
  });
});

describe("the delivery time beside the price", () => {
  it("is the ready time, or the made-to-order time for a piece the shopper is having made", () => {
    expect(productDeliveryLine({ settings: estimates, lang: "en", madeForShopper: false })).toBe(
      "Delivery in 2 days",
    );
    expect(productDeliveryLine({ settings: estimates, lang: "ar", madeForShopper: true })).toBe(
      "التجهيز خلال 10 أيام",
    );
  });

  it("is none in a catalog, when the store turned it off, or wrote none", () => {
    const off = (over: object) =>
      productDeliveryLine({
        settings: { ...estimates, ...over },
        lang: "en",
        madeForShopper: false,
      });
    expect(off({ storefront_mode: "catalog" })).toBeNull();
    expect(off({ delivery_estimate_enabled: false })).toBeNull();
    expect(off({ delivery_estimate_en: null })).toBeNull();
  });

  const heading = (settings: object, madeForShopper = false) =>
    render(
      <ProductTitleAndPrice
        {...({
          currency: "BHD",
          discountPercent: 0,
          displayName: "Chiffon abaya",
          displayPrice: 48,
          isWishlisted: () => false,
          lang: "en",
          madeForShopper,
          originalPrice: 0,
          priceLabel: "BHD 48.000",
          product: { id: "p1" },
          settings,
          t: (_ar: string, en: string) => en,
          toggleWishlist: vi.fn(),
        } as never)}
      />,
    );

  it("sits in the price's row", () => {
    heading(estimates);
    const pill = screen.getByText("Delivery in 2 days");
    expect(pill.closest("div")?.textContent).toContain("BHD 48.000");
  });

  it("shows beside a hidden price too, and not in a catalog", () => {
    heading({ ...estimates, catalog_show_prices: false, storefront_mode: "shop" }, true);
    expect(screen.getByText("Made in 10 days")).toBeTruthy();
    heading({ ...estimates, storefront_mode: "catalog" });
    expect(screen.getAllByText(/Made in|Delivery in/)).toHaveLength(1);
  });
});
