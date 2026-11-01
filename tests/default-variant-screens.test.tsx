import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Product, Variant } from "../src/features/inventory/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
// The picture uploader reaches the media host; a row's label is what is tested here.
vi.mock("@/features/inventory/components/VariantImageUploader", () => ({
  VariantImageUploader: () => null,
}));
vi.mock("../src/features/inventory/components/VariantImageUploader", () => ({
  VariantImageUploader: () => null,
}));

const { VariantMobileCard } =
  await import("../src/features/inventory/components/VariantMobileCard");
const { I18nProvider } = await import("../src/lib/i18n");

const product = { id: "p", base_price: 30, cost_price: 0, is_made_to_order: false } as Product;
const variant = (overrides: Partial<Variant>) =>
  ({
    id: "v",
    product_id: "p",
    size: null,
    color: null,
    fabric: null,
    option_four: null,
    option_five: null,
    size_unit: null,
    sku: "SKU-1",
    barcode: null,
    cost_price: 0,
    selling_price: 30,
    original_price: null,
    stock_main: 2,
    stock_incubator: 0,
    image_url: null,
    ...overrides,
  }) as unknown as Variant;

const renderCard = (v: Variant, isAr: boolean) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider>
        <VariantMobileCard
          v={v}
          canViewFinancials
          barcodeLabel="Barcode"
          SIZE_UNITS={[]}
          salesByVariant={new Map()}
          t={(key: string) => key}
          isAr={isAr}
          brand={{ id: "b" }}
          update={vi.fn()}
          changeStock={vi.fn(async () => true)}
          del={vi.fn()}
          mainLabel="Store"
          incLabel="Partners"
          isSelected={false}
          onToggleSelect={vi.fn()}
          product={product}
        />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe("a product's default variant in the inventory", () => {
  it("reads as no options, never as a Standard size", () => {
    renderCard(variant({}), false);
    expect(screen.getByText("No options")).toBeInTheDocument();
    expect(screen.queryByText(/Standard/)).not.toBeInTheDocument();
  });

  it("reads the word an older default kept in its size as no options too", () => {
    renderCard(variant({ size: "قياسي" }), true);
    expect(screen.getByText("بدون خيارات")).toBeInTheDocument();
    expect(screen.queryByText("قياسي")).not.toBeInTheDocument();
  });

  it("shows a real size, and only the colour beside an older default's word", () => {
    const { unmount } = renderCard(variant({ size: "54" }), false);
    expect(screen.getByText("54")).toBeInTheDocument();
    unmount();
    renderCard(variant({ size: "قياسي", color: "Black" }), false);
    expect(screen.queryByText("قياسي")).not.toBeInTheDocument();
    expect(screen.queryByText("No options")).not.toBeInTheDocument();
  });
});
