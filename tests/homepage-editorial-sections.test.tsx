import React from "react";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Joining the promo cards and the product grid to the editorial backgrounds is
// homeSectionBackgrounds (tests/home-products.test.ts); where the banner parallax
// may run is guarded in tests/storefront-performance-guardrails.test.ts.

const storefront = vi.hoisted(() => ({
  lang: "en",
  settings: {} as Record<string, unknown>,
}));
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: () => storefront,
}));
const card = {
  ProductCard: ({ product }: { product: { name: string } }) => <article>{product.name}</article>,
};
vi.mock("../src/components/storefront/product-card", () => card);
vi.mock("@/components/storefront/product-card", () => card);

const { MerchandisingSection } =
  await import("../src/features/storefront-home/components/MerchandisingSection");

const products = [{ id: "p1", name: "Silk Abaya" }] as never[];
const editorial = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  banner_image_url: "",
  background_color: "#123456",
  background_image_url: "https://media.boutq.store/best-bg.jpg",
  ...overrides,
});
const withSections = (best: Record<string, unknown>) => {
  storefront.settings = {
    show_new_arrivals: true,
    secondary_banner_parallax_enabled: false,
    homepage_editorial_sections: { best, sale: editorial(), trending: editorial() },
  };
};

describe("homepage editorial sections", () => {
  it("stores independent per-section display and background settings", () => {
    const migration = readFileSync(
      "supabase/migrations/20260813210000_add_homepage_editorial_sections.sql",
      "utf8",
    );
    for (const key of ["best", "sale", "trending"]) {
      expect(migration).toContain(`"${key}"`);
    }
    expect(migration).toContain("homepage_editorial_sections jsonb");
    expect(migration).toContain("banner_image_url");
    expect(migration).toContain("background_color");
    expect(migration).toContain("background_image_url");
  });

  it("renders editorial surfaces full width with bounded product content", () => {
    withSections(editorial());
    const { container } = render(<MerchandisingSection kind="best" products={products} />);
    const section = container.querySelector("section")!;
    expect(section.className).toContain("w-full overflow-hidden");
    expect(section.className).not.toContain("border");
    expect(section.style.backgroundColor).toBe("rgb(18, 52, 86)");
    expect(section.style.backgroundImage).toContain("best-bg.jpg");
    // The products sit in a bounded, centred container inside the full-width surface.
    const inner = screen.getByText("Silk Abaya").closest(".max-w-7xl");
    expect(inner?.className).toContain("mx-auto");
  });

  it("shows the editorial banner above the products when one is set", () => {
    withSections(editorial({ banner_image_url: "https://media.boutq.store/best-banner.jpg" }));
    const { container } = render(<MerchandisingSection kind="best" products={products} />);
    expect(container.innerHTML).toContain("best-banner.jpg");
    expect(screen.getByText("Silk Abaya")).toBeInTheDocument();
  });

  it("hides a section the store switched off, and keeps new arrivals plain", () => {
    withSections(editorial({ enabled: false }));
    const hidden = render(<MerchandisingSection kind="best" products={products} />);
    expect(hidden.container).toBeEmptyDOMElement();
    hidden.unmount();

    const plain = render(<MerchandisingSection kind="new" products={products} />);
    expect(plain.container.querySelector("section")?.className).not.toContain("w-full");
  });
});
