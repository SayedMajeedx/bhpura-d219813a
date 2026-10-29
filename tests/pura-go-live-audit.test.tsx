import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StorefrontVariant } from "../src/lib/data/storefront";

// What the go-live audit of Pura's live storefront found (2026-10-29): Sabeeka, 24 BHD, was 30,
// read "-20%" on its card and full price on its own page until a size was chosen; the bundle under
// it priced the piece at 30 (the product's base price) and the pair at 58 instead of 52; a product
// link that leads nowhere said the store did not exist; the policy pages' titles were English on
// the Arabic store.

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
  useIsServicesStore: () => false,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const client = { supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));

const { originalPriceFor, wasPriceVariant, discountPercentFor } =
  await import("../src/features/product-page/lib/pdp-pricing");
const { BundleOffer } = await import("../src/components/storefront/BundleOffer");
const { ProductUnavailable } =
  await import("../src/features/product-page/components/ProductUnavailable");
const { categoryHead } = await import("../src/features/storefront-shell/lib/category-head");

const v = (id: string, size: string, price: number, original: number | null, stock = 1) =>
  ({
    id,
    size,
    size_unit: null,
    color: null,
    fabric: null,
    selling_price: price,
    original_price: original,
    stock_main: stock,
    stock_incubator: 0,
    image_url: null,
  }) as StorefrontVariant;

// Sabeeka: every size 24, was 30; the product's base price is 30.
const sabeekaSizes = [v("s52", "52", 24, 30), v("s54", "54", 24, 30), v("s56", "56", 24, 30, 0)];
const sabeeka = {
  id: "sabeeka",
  name: "Sabeeka",
  base_price: 30,
  is_made_to_order: false,
  product_variants: sabeekaSizes,
};
const marjan = {
  id: "marjan",
  name: "Marjan",
  item_kind: "product",
  base_price: 35,
  product_variants: [v("m52", "52", 28, null)],
};

describe("a piece on sale, before a size is chosen", () => {
  it("strikes its 'was' price through on its page, as its card does", () => {
    const was = originalPriceFor({
      isRange: false,
      variant: wasPriceVariant(null, sabeekaSizes),
      basePrice: 30,
      productOriginalPrice: 0,
    });
    expect(was).toBe(30);
    expect(discountPercentFor(was, 24)).toBe(20);
  });

  it("keeps the chosen size's own 'was' price, and strikes nothing for a piece not on sale", () => {
    const chosen = v("own", "54", 24, 32);
    expect(wasPriceVariant(chosen, sabeekaSizes)).toBe(chosen);
    expect(wasPriceVariant(null, [v("a", "52", 28, null), v("b", "54", 28, 0)])).toBeNull();
  });

  it("is priced in the bundle at what it costs, not at the product's base price", () => {
    render(<BundleOffer mainProduct={sabeeka} mainVariant={null} bundleItems={[marjan]} />);
    expect(screen.getAllByText(/24\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/28\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/52\.000/)).toBeTruthy();
    expect(screen.queryByText(/30\.000|35\.000|58\.000/)).toBeNull();
  });
});

describe("a product link that leads nowhere", () => {
  it("says the product is not there, inside the store, with a way on", () => {
    render(<ProductUnavailable />);
    expect(screen.getByRole("heading", { name: "This product is not available" })).toBeTruthy();
    expect(screen.getByText("Browse all products")).toBeTruthy();
    expect(screen.queryByText(/storefront/i)).toBeNull();
  });
});

describe("a policy page's head", () => {
  const loaderData = (initialLang: "ar" | "en") => ({
    brand: { name_en: "PURA LINE", name_ar: "بيورا لاين", logo_url: null },
    page: {
      slug: "terms-conditions",
      title_ar: "الشروط والأحكام",
      title_en: "Terms & Conditions",
      content_ar: "<p>تسري هذه الشروط على كل طلب.</p>",
      content_en: "These terms apply to every order.",
    },
    initialLang,
  });
  const meta = (head: ReturnType<typeof categoryHead>) =>
    Object.fromEntries(
      (head.meta ?? []).map((m: Record<string, string>) => [m.name ?? m.property ?? "title", m]),
    );

  it("is in the page's language and names the store", () => {
    const ar = meta(categoryHead({ loaderData: loaderData("ar"), slug: "pura", category: "x" }));
    expect(ar.title.title).toBe("الشروط والأحكام | بيورا لاين");
    expect(ar.description.content).toBe("تسري هذه الشروط على كل طلب.");
    const en = meta(categoryHead({ loaderData: loaderData("en"), slug: "pura", category: "x" }));
    expect(en.title.title).toBe("Terms & Conditions | PURA LINE");
    expect(en.description.content).toBe("These terms apply to every order.");
  });
});
