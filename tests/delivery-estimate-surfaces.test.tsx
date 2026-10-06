import React from "react";
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeliveryEstimateLines } from "../src/features/checkout/components/DeliveryEstimateLines";
import { useCheckoutFulfillment } from "../src/features/checkout/hooks/use-checkout-fulfillment";
import { ProductPurchaseActions } from "../src/features/product-page/components/ProductPurchaseActions";

// Where a shopper reads the delivery time: the product page (by what they chose) and checkout (by
// what is in the cart).

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}));

const store = {
  delivery_enabled: true,
  pickup_enabled: true,
  digital_delivery_enabled: false,
  delivery_fee: 2,
  cod_enabled: true,
  card_enabled: false,
  benefit_enabled: false,
  shipping_zones: [],
  delivery_estimate_enabled: true,
  delivery_estimate_en: "Within 24 hours",
  delivery_estimate_ar: "خلال 24 ساعة",
  delivery_estimate_tailored_en: "Within 7 - 10 days",
  delivery_estimate_tailored_ar: "خلال 7 - 10 أيام",
};
type Settings = Parameters<typeof useCheckoutFulfillment>[0]["settings"];

describe("the product page's delivery time", () => {
  const page = (
    over: { made?: boolean; tailoring?: boolean; settings?: object; lang?: "en" | "ar" } = {},
  ) =>
    render(
      <ProductPurchaseActions
        {...({
          brand: {},
          doAdd: vi.fn(),
          errorMsg: null,
          inquiryUrl: null,
          isTailoringActive: over.tailoring ?? false,
          lang: over.lang ?? "en",
          maxStock: 3,
          product: { id: "p1", is_made_to_order: over.made ?? false },
          qty: 1,
          selectedVariantOutOfStock: false,
          setQty: vi.fn(),
          settings: { storefront_mode: "shop", ...store, ...over.settings },
          t: (ar: string, en: string) => (over.lang === "ar" ? ar : en),
          variant: { id: "v1", stock_main: 3 },
          vocabulary: {},
        } as never)}
      />,
    );

  it("says the ready time for a ready piece", () => {
    page();
    expect(screen.getByText("Within 24 hours")).toBeTruthy();
    expect(screen.queryByText(/7 - 10/)).toBeNull();
  });

  it("says the made-to-order time on a piece the shopper is having made", () => {
    page({ made: true, tailoring: true });
    expect(screen.getByText("Within 7 - 10 days")).toBeTruthy();
    expect(screen.queryByText("Within 24 hours")).toBeNull();
  });

  it("says the ready time when a ready size is chosen on a made-to-order piece", () => {
    page({ made: true, tailoring: false });
    expect(screen.getByText("Within 24 hours")).toBeTruthy();
  });

  it("reads Arabic to an Arabic shopper", () => {
    page({ made: true, tailoring: true, lang: "ar" });
    expect(screen.getByText("خلال 7 - 10 أيام")).toBeTruthy();
  });

  it("is unchanged for a store that wrote no made-to-order time", () => {
    page({
      made: true,
      tailoring: true,
      settings: { delivery_estimate_tailored_en: null, delivery_estimate_tailored_ar: null },
    });
    expect(screen.getByText("Within 24 hours")).toBeTruthy();
  });
});

describe("checkout's delivery time", () => {
  const lines = (kinds: { ready: boolean; tailored: boolean }, settings: object = store) =>
    renderHook(() => useCheckoutFulfillment({ settings: settings as Settings, lang: "en", kinds }))
      .result.current;

  it("follows the cart: ready, tailored, or both", () => {
    expect(lines({ ready: true, tailored: false }).estimatedDeliveryLines).toEqual([
      { kind: "all", label: null, text: "Within 24 hours" },
    ]);
    expect(lines({ ready: false, tailored: true }).estimatedDeliveryLines).toEqual([
      { kind: "tailored", label: null, text: "Within 7 - 10 days" },
    ]);
    expect(
      lines({ ready: true, tailored: true }).estimatedDeliveryLines.map((l) => l.text),
    ).toEqual(["Within 24 hours", "Within 7 - 10 days"]);
  });

  it("shows nothing new for a store with no made-to-order time, and the default when none is written", () => {
    const none = { ...store, delivery_estimate_tailored_en: null, delivery_estimate_en: null };
    expect(lines({ ready: true, tailored: true }, none).estimatedDeliveryLines).toEqual([
      { kind: "all", label: null, text: "Within 24 - 48 hours in Bahrain" },
    ]);
  });

  it("offers the Bahrain card in the address step only when the store wrote a time", () => {
    expect(lines({ ready: true, tailored: true }).homeEstimateLines).toHaveLength(2);
    const unwritten = {
      ...store,
      delivery_estimate_en: null,
      delivery_estimate_tailored_en: null,
    };
    expect(lines({ ready: true, tailored: true }, unwritten).homeEstimateLines).toEqual([]);
  });

  it("reads each kind on its own line, naming the pieces, when the cart holds both", () => {
    const both = lines({ ready: true, tailored: true }).estimatedDeliveryLines;
    render(<DeliveryEstimateLines lines={both} />);
    expect(screen.getByText("Ready pieces:")).toBeTruthy();
    expect(screen.getByText(/Within 24 hours/)).toBeTruthy();
    expect(screen.getByText("Made-to-order pieces:")).toBeTruthy();
    expect(screen.getByText(/Within 7 - 10 days/)).toBeTruthy();
  });

  it("reads as one plain sentence when the cart holds one kind", () => {
    const one = lines({ ready: false, tailored: true }).estimatedDeliveryLines;
    const { container } = render(<DeliveryEstimateLines lines={one} />);
    expect(container.textContent).toBe("Within 7 - 10 days");
  });
});
