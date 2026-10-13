import React, { useState } from "react";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StorefrontVariant } from "../src/lib/data/storefront";

// What a shopper's choice adds to the cart. The product page used to read "nothing
// chosen" as "anything fits" and take the first variant: Pura's dress opened on
// black 50, out of stock, and offered "notify me" while 53 and 54 were on the shelf.
// The bundle ("Complete your order") added that variant anyway, and the second piece
// in its first variant, another size. Checkout ticked the marketing consent for the
// shopper. Found on the live storefront, 2026-10-14.

const storefront = {
  brand: { id: "b1", slug: "pura" },
  lang: "en",
  currency: "BHD",
  t: (_ar: string, en: string) => en,
  addToCart: vi.fn(),
};
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const rpc = vi.fn(async () => ({ data: null, error: null }));
const client = { supabase: { rpc } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { chosenVariant, previewVariant, choiceUnavailable } =
  await import("../src/features/product-page/lib/variant-options");
const { useVariantSelectionSync } =
  await import("../src/features/product-page/hooks/use-variant-selection-sync");
const { bundleBlock, companionVariant } = await import("../src/lib/cart/bundle-offer");
const { BundleOffer } = await import("../src/components/storefront/BundleOffer");
const { syncStorefrontCartActivity } = await import("../src/lib/abandoned-carts.functions");

const v = (id: string, size: string, color: string, stock: number, extra = {}) =>
  ({
    id,
    size,
    size_unit: null,
    color,
    fabric: null,
    selling_price: 8,
    original_price: null,
    stock_main: stock,
    stock_incubator: 0,
    image_url: null,
    ...extra,
  }) as StorefrontVariant;

// Pura's dress: black 50 (none), 53 and 54 (on the shelf); navy 50 (none).
const dress = [
  v("black-50", "50", "Black", 0),
  v("black-53", "53", "Black", 2),
  v("black-54", "54", "Black", 1, { image_url: "black.jpg" }),
  v("navy-50", "50", "Navy", 0, { image_url: "navy.jpg" }),
];
const offered = {
  size: ["50", "53", "54"],
  color: ["Black", "Navy"],
  fabric: [],
  four: [],
  five: [],
};
const none = { size: null, color: null, fabric: null, four: null, five: null };

describe("the variant a choice names", () => {
  it("is none while an option offered with several values is still open", () => {
    expect(chosenVariant(dress, none, offered)).toBeNull();
    expect(chosenVariant(dress, { ...none, color: "Black" }, offered)).toBeNull();
    expect(chosenVariant(dress, { ...none, size: "53" }, offered)).toBeNull();
  });

  it("is the shopper's choice once every option is chosen, even out of stock", () => {
    expect(chosenVariant(dress, { ...none, size: "53", color: "Black" }, offered)?.id).toBe(
      "black-53",
    );
    expect(chosenVariant(dress, { ...none, size: "50", color: "Black" }, offered)?.id).toBe(
      "black-50",
    );
  });

  it("needs no choice on an option with one value", () => {
    const oneColour = { ...offered, color: ["Black"] };
    expect(chosenVariant(dress, { ...none, size: "54" }, oneColour)?.id).toBe("black-54");
  });

  it("shows a fitting variant's photo while the choice is partial, none before", () => {
    expect(previewVariant(dress, none)).toBeNull();
    expect(previewVariant(dress, { ...none, color: "Navy" })?.image_url).toBe("navy.jpg");
    expect(previewVariant(dress, { ...none, color: "Black" })?.image_url).toBe("black.jpg");
  });
});

describe("when the page offers 'notify me'", () => {
  const fromStock = { is_made_to_order: false };

  it("not when nothing is chosen and the piece is on the shelf", () => {
    expect(
      choiceUnavailable({
        variant: null,
        variants: dress,
        product: fromStock,
        isTailoringActive: false,
      }),
    ).toBe(false);
  });

  it("when the chosen size has no piece, or nothing is left at all", () => {
    expect(
      choiceUnavailable({
        variant: dress[0],
        variants: dress,
        product: fromStock,
        isTailoringActive: false,
      }),
    ).toBe(true);
    const soldOut = dress.map((x) => ({ ...x, stock_main: 0 }));
    expect(
      choiceUnavailable({
        variant: null,
        variants: soldOut,
        product: fromStock,
        isTailoringActive: false,
      }),
    ).toBe(true);
  });

  it("never for a piece made to order, which can be bought with no ready stock", () => {
    const soldOut = dress.map((x) => ({ ...x, stock_main: 0 }));
    const madeToOrder = { is_made_to_order: true };
    expect(
      choiceUnavailable({
        variant: null,
        variants: soldOut,
        product: madeToOrder,
        isTailoringActive: false,
      }),
    ).toBe(false);
    expect(
      choiceUnavailable({
        variant: dress[0],
        variants: dress,
        product: madeToOrder,
        isTailoringActive: true,
      }),
    ).toBe(false);
  });
});

describe("the product page on load", () => {
  function usePage(variants: StorefrontVariant[]) {
    const [variantId, setVariantId] = useState<string | null>("stale");
    const [size, setSize] = useState<string | null>(null);
    const [color, setColor] = useState<string | null>(null);
    const [fabric, setFabric] = useState<string | null>(null);
    const [four, setFour] = useState<string | null>(null);
    const [five, setFive] = useState<string | null>(null);
    const sizes = [...new Set(variants.map((x) => x.size).filter(Boolean))] as string[];
    const colors = [...new Set(variants.map((x) => x.color).filter(Boolean))] as string[];
    useVariantSelectionSync({
      variants,
      variantId,
      setVariantId,
      uniqueSizes: sizes,
      uniqueColors: colors,
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
    return { variantId, setSize, setColor };
  }

  it("chooses nothing for the shopper, then the size and colour they pick", () => {
    const { result, rerender } = renderHook(() => usePage(dress));
    expect(result.current.variantId).toBeNull();
    result.current.setColor("Black");
    rerender();
    expect(result.current.variantId).toBeNull();
    result.current.setSize("53");
    rerender();
    expect(result.current.variantId).toBe("black-53");
  });

  it("still chooses a product's only variant", () => {
    const { result } = renderHook(() => usePage([dress[1]]));
    expect(result.current.variantId).toBe("black-53");
  });
});

describe("the bundle's rules", () => {
  it("waits for the choice, and steps aside out of stock or made to order", () => {
    const product = { product_variants: dress };
    expect(bundleBlock({ mainProduct: product, mainVariant: null, madeToOrderChoice: false })).toBe(
      "choose",
    );
    expect(
      bundleBlock({ mainProduct: product, mainVariant: dress[0], madeToOrderChoice: false }),
    ).toBe("out");
    expect(
      bundleBlock({ mainProduct: product, mainVariant: dress[1], madeToOrderChoice: true }),
    ).toBe("made_to_order");
    expect(
      bundleBlock({ mainProduct: product, mainVariant: dress[1], madeToOrderChoice: false }),
    ).toBeNull();
  });

  it("adds a second piece only in a variant it can name", () => {
    const sizes = [
      v("l-53", "53", "Sand", 1),
      v("l-55", "55", "Sand", 3),
      v("l-54", "54", "Sand", 0),
    ];
    expect(companionVariant({ product_variants: sizes }, dress[1])?.id).toBe("l-53");
    // The shopper's size is out in the second piece, or it has two in that size.
    expect(companionVariant({ product_variants: sizes }, dress[2])).toBeNull();
    const twoColours = [...sizes, v("l-53b", "53", "Black", 1)];
    expect(companionVariant({ product_variants: twoColours }, dress[1])).toBeNull();
    // One variant: that one, if in stock.
    expect(companionVariant({ product_variants: [sizes[1]] }, null)?.id).toBe("l-55");
    expect(companionVariant({ product_variants: [sizes[2]] }, null)).toBeNull();
    // Made to order, or with details to fill: its own page.
    expect(
      companionVariant({ product_variants: [sizes[1]], is_made_to_order: true }, null),
    ).toBeNull();
    expect(
      companionVariant({ product_variants: [sizes[1]], custom_fields: [{ key: "name" }] }, null),
    ).toBeNull();
  });
});

describe("the bundle on the page", () => {
  const main = { id: "dress", name: "Taif", is_made_to_order: true, product_variants: dress };
  const lujain = {
    id: "lujain",
    name: "Lujain",
    item_kind: "product",
    product_variants: [v("lj-53", "53", "Sand", 1), v("lj-55", "55", "Sand", 2)],
  };

  beforeEach(() => storefront.addToCart.mockClear());

  it("asks for the size first, and adds nothing until it is chosen", () => {
    render(<BundleOffer mainProduct={main} mainVariant={null} bundleItems={[lujain]} />);
    const button = screen.getByRole("button", { name: /Choose your size first/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(storefront.addToCart).not.toHaveBeenCalled();
  });

  it("adds the chosen ready size and the second piece in the same size", () => {
    render(<BundleOffer mainProduct={main} mainVariant={dress[1]} bundleItems={[lujain]} />);
    fireEvent.click(screen.getByRole("button", { name: /Add bundle to cart/ }));
    const [first, second] = storefront.addToCart.mock.calls.map((call) => call[0]);
    // A made-to-order piece added in a ready size says so: it is not made for the shopper.
    expect(first).toMatchObject({ variant_id: "black-53", size: "53", tailored: false });
    expect(second).toMatchObject({ variant_id: "lj-53", size: "53" });
  });

  it("is not shown while the chosen size is out, or when no second piece fits the size", () => {
    const { container, rerender } = render(
      <BundleOffer mainProduct={main} mainVariant={dress[0]} bundleItems={[lujain]} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<BundleOffer mainProduct={main} mainVariant={dress[2]} bundleItems={[lujain]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("marketing consent", () => {
  it("is never assumed when a cart is recorded", async () => {
    await syncStorefrontCartActivity({
      brandId: "b1",
      sessionId: "s1",
      cartItems: [{ product_id: "p1", qty: 1 } as never],
      subtotal: 8,
    });
    expect(rpc).toHaveBeenCalledWith(
      "rpc_record_or_update_cart_activity",
      expect.objectContaining({ p_marketing_consent: false }),
    );
  });
});
