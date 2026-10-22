import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useState } from "react";
import { productHead } from "../src/features/product-page/lib/product-head";
import { useVariantSelectionSync } from "../src/features/product-page/hooks/use-variant-selection-sync";

// The product page tells Google what the shopping feed tells it: the price and availability the
// cards show (the cheapest size a shopper can buy now, by the one availability rule) in the
// store's own currency, and no offer at all when the store hides its prices. Google compares the
// two and refuses a feed whose pages disagree. A feed's link names a size, and the page opens on it.

type Offer = {
  "@type": string;
  price?: number;
  lowPrice?: number;
  highPrice?: number;
  priceCurrency: string;
  availability: string;
};

const offerOf = (loaderData: Record<string, unknown>): Offer | undefined => {
  const head = productHead({ loaderData, params: { slug: "pura", id: "p1" } }) as {
    scripts?: Array<{ children?: string }>;
  };
  const schemas = (head.scripts ?? []).map((script) => JSON.parse(script.children ?? "null"));
  return schemas.find((schema) => schema?.["@type"] === "Product")?.offers;
};

const product = (variants: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) => ({
  id: "p1",
  name_en: "Layla Abaya",
  base_price: 99,
  product_variants: variants.map((variant, index) => ({ id: `v${index}`, ...variant })),
  ...over,
});

describe("the product page's Google data", () => {
  it("prices from the sizes a shopper can buy now, in the store's currency", () => {
    const offer = offerOf({
      initialLang: "en",
      brand: { slug: "pura" },
      currency: "SAR",
      product: product([
        { selling_price: 20, stock_main: 0 },
        { selling_price: 30, stock_main: 2 },
      ]),
    });
    expect(offer).toMatchObject({
      "@type": "Offer",
      price: 30,
      priceCurrency: "SAR",
      availability: "https://schema.org/InStock",
    });
  });

  it("gives a range when the buyable sizes differ in price", () => {
    const offer = offerOf({
      product: product([
        { selling_price: 20, stock_main: 1 },
        { selling_price: 30, stock_main: 1 },
      ]),
    });
    expect(offer).toMatchObject({ "@type": "AggregateOffer", lowPrice: 20, highPrice: 30 });
  });

  it("says out of stock when no size can be bought, and in stock while made to order", () => {
    const soldOut = [{ selling_price: 20, stock_main: 0 }];
    expect(offerOf({ product: product(soldOut) })?.availability).toBe(
      "https://schema.org/OutOfStock",
    );
    expect(offerOf({ product: product(soldOut, { is_made_to_order: true }) })?.availability).toBe(
      "https://schema.org/InStock",
    );
  });

  it("publishes no offer when the store hides its prices", () => {
    expect(
      offerOf({ showPrices: false, product: product([{ selling_price: 20, stock_main: 1 }]) }),
    ).toBeUndefined();
  });
});

describe("opening on the size a link names", () => {
  const variants = [
    { id: "v52", size: "52", color: "Black" },
    { id: "v54", size: "54", color: "Black" },
    { id: "v54s", size: "54", color: "Sand" },
  ] as unknown as Parameters<typeof useVariantSelectionSync>[0]["variants"];

  const render = (linkedVariantId: string | null) =>
    renderHook(() => {
      const [variantId, setVariantId] = useState<string | null>(null);
      const [size, setSize] = useState<string | null>(null);
      const [color, setColor] = useState<string | null>(null);
      const [fabric, setFabric] = useState<string | null>(null);
      const [four, setFour] = useState<string | null>(null);
      const [five, setFive] = useState<string | null>(null);
      useVariantSelectionSync({
        linkedVariantId,
        variants,
        variantId,
        setVariantId,
        uniqueSizes: ["52", "54"],
        uniqueColors: ["Black", "Sand"],
        uniqueFabrics: [],
        uniqueFour: [],
        uniqueFive: [],
        selectedSize: size,
        setSelectedSize: setSize,
        selectedColor: color,
        setSelectedColor: setColor,
        selectedFabric: fabric,
        setSelectedFabric: setFabric,
        selectedOptionFour: four,
        setSelectedOptionFour: setFour,
        selectedOptionFive: five,
        setSelectedOptionFive: setFive,
      });
      return { variantId, size, color };
    });

  it("chooses every option of the linked size", () => {
    expect(render("v54s").result.current).toEqual({ variantId: "v54s", size: "54", color: "Sand" });
  });

  it("chooses nothing without a link, or with one to a size the product does not have", () => {
    expect(render(null).result.current.variantId).toBeNull();
    expect(render("elsewhere").result.current.variantId).toBeNull();
  });
});
