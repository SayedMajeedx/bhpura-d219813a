import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { postName } from "../src/lib/product-name";
import { suggestionRail } from "../src/features/product-page/lib/suggestions";

// The product page review of 2026-11-15: the name showed as the catalogue writes it
// ("عباية | غُصن"), a phone's first screen was the photo and a row of thumbnails with the price
// below it, the delivery time was a green badge, the sizing choice two large boxes under a
// heading, three suggestion blocks one after another (one of them, "Customers also bought", the
// store's best sellers), and no way back to the category on a laptop.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params: _p, ...props }: Record<string, unknown>) => (
    <a href={String(to)} {...(props as object)}>
      {children as React.ReactNode}
    </a>
  ),
}));

const storefrontModule = vi.hoisted(() => async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura" },
    lang: "ar",
    t: (ar: string) => ar,
  }),
}));
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));

const categoriesModule = vi.hoisted(() => () => ({
  useStorefrontCategories: () => ({
    data: [{ id: "c1", slug: "abayas", name_ar: "عبايات", name_en: "Abayas" }],
  }),
}));
vi.mock("../src/lib/use-storefront-categories", categoriesModule);
vi.mock("@/lib/use-storefront-categories", categoriesModule);

const { ProductBreadcrumb } =
  await import("../src/features/product-page/components/ProductBreadcrumb");

describe("a product's name", () => {
  it("reads as the piece, with its kind apart", () => {
    expect(postName("عباية | غُصن")).toEqual({ kind: "عباية", name: "غُصن", label: "عباية غُصن" });
    expect(postName("Abaya | Ghusn").name).toBe("Ghusn");
  });

  it("stays whole when the store wrote no divider", () => {
    expect(postName("Silk kaftan")).toEqual({
      kind: null,
      name: "Silk kaftan",
      label: "Silk kaftan",
    });
  });
});

describe("the suggestions under the page", () => {
  const p = (id: string) => ({ id });

  it("are one rail: the same category, then the best sellers, each once", () => {
    const rail = suggestionRail({
      related: [p("a"), p("b")],
      bestSelling: [p("b"), p("c"), p("d")],
    });
    expect(rail.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("leave out what the bundle offers, and stop at twelve", () => {
    const many = Array.from({ length: 20 }, (_, i) => p(`x${i}`));
    const rail = suggestionRail({ related: [p("a"), ...many], bestSelling: [], exclude: ["a"] });
    expect(rail[0].id).toBe("x0");
    expect(rail).toHaveLength(12);
  });
});

describe("the breadcrumb", () => {
  it("goes home and back to the product's category, and names the piece", () => {
    render(<ProductBreadcrumb category="abayas" displayName="عباية | غُصن" />);
    const nav = screen.getByRole("navigation", { name: "مسار التنقل" });
    expect(nav.className).toMatch(/hidden md:block/);
    expect(screen.getByRole("link", { name: "الرئيسية" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "عبايات" })).toBeTruthy();
    expect(screen.getByText("غُصن").getAttribute("aria-current")).toBe("page");
  });

  it("leaves the category out when the product has none the store shows", () => {
    render(<ProductBreadcrumb category="gone" displayName="Ghusn" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
