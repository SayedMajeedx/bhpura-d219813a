import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { sizeGuidesManifest } from "../src/addons/size-guides/manifest";
import { resolveAllVariantAxes } from "../src/lib/addons/addon-registry";
import { offeredSizes, tailoringState } from "../src/features/product-page/lib/variant-options";
import type { StorefrontVariant } from "../src/lib/data/storefront";

const storefront = {
  brand: { id: "b1", slug: "pura" },
  lang: "en",
  t: (_ar: string, en: string) => en,
  session: null,
  settings: {},
};
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { ProductOptionPickers } =
  await import("../src/features/product-page/components/ProductOptionPickers");
const { ProductFitPassportSection } =
  await import("../src/addons/fit-passport/components/storefront/ProductFitPassportSection");

// A made-to-order abaya whose only variant is the "قياسي" placeholder.
const placeholder = {
  id: "v1",
  size: "قياسي",
  color: null,
  fabric: null,
  selling_price: 40,
  stock_main: 0,
} as unknown as StorefrontVariant;
const sized = { ...placeholder, id: "v2", size: "52", stock_main: 2 } as StorefrontVariant;

const pickers = (overrides: Record<string, unknown>) => {
  const props = {
    hasReadySizes: true,
    hasVariants: true,
    isColorOutOfStock: {},
    isFabricOutOfStock: {},
    isMadeToOrder: true,
    isMeasurementField: (key: string) => key.startsWith("m_"),
    isSizeOutOfStock: {},
    isTailoringActive: false,
    isVisualColorAxis: false,
    lang: "en",
    optionsRef: createRef<HTMLDivElement>(),
    primary: "#000",
    product: { id: "p1", is_made_to_order: true },
    resolvedAxes: resolveAllVariantAxes({ lang: "en" }),
    selectedColor: null,
    selectedFabric: null,
    selectedOptionFive: null,
    selectedOptionFour: null,
    selectedSize: null,
    setCfValues: vi.fn(),
    setErrorMsg: vi.fn(),
    setMeasurementsApplied: vi.fn(),
    setQty: vi.fn(),
    setSelectedColor: vi.fn(),
    setSelectedFabric: vi.fn(),
    setSelectedOptionFive: vi.fn(),
    setSelectedOptionFour: vi.fn(),
    setSelectedSize: vi.fn(),
    setSizeMode: vi.fn(),
    setVariantId: vi.fn(),
    showSizeModeToggle: false,
    sizeMode: "custom",
    t: storefront.t,
    uniqueColors: [],
    uniqueFabrics: [],
    uniqueFive: [],
    uniqueFour: [],
    uniqueSizes: [],
    variantId: null,
    variants: [placeholder],
    vocabulary: { made_to_order: { en: "Tailored for you" }, custom_order: { en: "Bespoke" } },
    ...overrides,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductOptionPickers {...(props as never)} />
    </QueryClientProvider>,
  );
  return props;
};

describe("Storefront Tailoring Experience & Sizing Consolidation", () => {
  it("Item 1: Fit Passport section hides when sizeMode is 'ready'", () => {
    const show = (sizeMode: "ready" | "custom") =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ProductFitPassportSection
            product={{ id: "p1", name: "Abaya" }}
            customFields={[{ key: "fit_passport_length", label_en: "Length" }]}
            sizeMode={sizeMode}
          />
        </QueryClientProvider>,
      );
    const ready = show("ready");
    expect(ready.container).toBeEmptyDOMElement();
    ready.unmount();
    expect(show("custom").container).not.toBeEmptyDOMElement();
  });

  it("Item 1: Switching to ready size cleans up measurement values", () => {
    const props = pickers({ showSizeModeToggle: true, uniqueSizes: ["52"], variants: [sized] });
    fireEvent.click(screen.getByRole("button", { name: "Ready Size" }));
    expect(props.setSizeMode).toHaveBeenCalledWith("ready");
    expect(props.setMeasurementsApplied).toHaveBeenCalledWith(false);
    const clean = (props.setCfValues as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      prev: Record<string, string>,
    ) => Record<string, string>;
    expect(clean({ m_bust: "40", m_length: "56", notes: "Hem lower" })).toEqual({
      notes: "Hem lower",
    });
  });

  it("Item 2: Redundant inline size-guide accordion is removed in favor of top modal guide", () => {
    const slots = sizeGuidesManifest.contributions?.slots ?? [];
    const inlineSlot = slots.find(
      (s) => s.id === "size-guide-inline" || s.placement === "storefront.product.afterCta",
    );
    expect(inlineSlot).toBeUndefined();
    const modalSlot = slots.find(
      (s) => s.id === "size-guide-modal" && s.placement === "storefront.product.optionsAside",
    );
    expect(modalSlot).toBeDefined();
  });

  it("Item 3: ready sizes need real sizes, and without them the product is tailored only", () => {
    const base = { isMadeToOrder: true, hasCustomFields: true, madeToOrderModule: true };
    // Placeholder variants offer no ready size.
    const onlyPlaceholder = tailoringState({
      ...base,
      offeredSizes: offeredSizes([placeholder]),
      sizeMode: "ready",
    });
    expect(onlyPlaceholder).toEqual({
      hasReadySizes: false,
      showSizeModeToggle: false,
      isTailoringActive: true,
      tailoredOnly: true,
    });

    const both = tailoringState({ ...base, offeredSizes: ["52"], sizeMode: "ready" });
    expect(both).toMatchObject({ showSizeModeToggle: true, isTailoringActive: false });
    expect(tailoringState({ ...base, offeredSizes: ["52"], sizeMode: "custom" })).toMatchObject({
      isTailoringActive: true,
      tailoredOnly: false,
    });
    expect(
      tailoringState({ ...base, isMadeToOrder: false, offeredSizes: [], sizeMode: "ready" }),
    ).toMatchObject({ isTailoringActive: false, tailoredOnly: false });
  });

  it("Item 3: tailoring hides placeholder variants (like قياسي) and shows the bespoke callout", () => {
    pickers({ hasReadySizes: false, isTailoringActive: true });
    expect(screen.getByText("Tailored for you")).toBeInTheDocument();
    expect(screen.getByText("Bespoke")).toBeInTheDocument();
    expect(screen.queryByText("Options")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "قياسي" })).not.toBeInTheDocument();
  });
});
