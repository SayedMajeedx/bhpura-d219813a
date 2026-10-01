import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// A package's page lists what it includes, what that costs apart for the chosen
// length, and the saving. The data layer and the store are faked.

const state = vi.hoisted(() => ({ lang: "en" as "en" | "ar" }));
const storefront = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora" },
    lang: state.lang,
    currency: "BHD",
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
});
vi.mock("../src/lib/storefront-context", (io) => storefront(io));
vi.mock("@/lib/storefront-context", (io) => storefront(io));
const fixture = (key: string, value: unknown) => ({
  queryKey: ["package-includes-test", key],
  queryFn: async () => value,
});
const storefrontData = {
  storefrontQueries: {
    products: () =>
      fixture("products", [
        {
          id: "booth",
          name: "Booth",
          name_en: "Booth",
          name_ar: "فوتوبوث",
          product_variants: [
            { id: "a", selling_price: 60, duration_minutes: 180 },
            { id: "b", selling_price: 90, duration_minutes: 300 },
          ],
        },
        {
          id: "prints",
          name: "Prints",
          name_en: "Prints",
          name_ar: "طباعة",
          product_variants: [{ id: "c", selling_price: 20, duration_minutes: null }],
        },
      ]),
  },
};
vi.mock("../src/lib/data/storefront", () => storefrontData);
vi.mock("@/lib/data/storefront", () => storefrontData);
const packagesData = {
  servicePackagesQueries: {
    items: () =>
      fixture("items", [
        { package_id: "gold", product_id: "booth", quantity: 1, sort_order: 0 },
        { package_id: "gold", product_id: "prints", quantity: 2, sort_order: 1 },
      ]),
  },
  packageLinesById: (rows: Array<{ package_id: string; product_id: string; quantity: number }>) => {
    const map = new Map<string, Array<{ product_id: string; quantity: number }>>();
    for (const row of rows) {
      map.set(row.package_id, [
        ...(map.get(row.package_id) ?? []),
        { product_id: row.product_id, quantity: row.quantity },
      ]);
    }
    return map;
  },
};
vi.mock("../src/lib/data/service-packages", () => packagesData);
vi.mock("@/lib/data/service-packages", () => packagesData);

const { PackageIncludes } = await import("../src/features/product-page/components/PackageIncludes");

const renderIt = (props: React.ComponentProps<typeof PackageIncludes>) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PackageIncludes {...props} />
    </QueryClientProvider>,
  );

describe("what a package includes, on its page", () => {
  it("lists the services with their counts, what they cost apart and the saving", async () => {
    state.lang = "en";
    renderIt({ product: { id: "gold", is_package: true }, minutes: 180, price: 80 });
    expect(await screen.findByText("Booth")).toBeInTheDocument();
    expect(screen.getByText("Prints × 2")).toBeInTheDocument();
    // 3 hours: booth 60 + two prints at 20 = 100 apart; the package is 80.
    expect(screen.getByText(/Apart:/)).toHaveTextContent(/100\.000/);
    expect(screen.getByText(/Save 20%/)).toBeInTheDocument();
  });

  it("follows the chosen length", async () => {
    state.lang = "en";
    renderIt({ product: { id: "gold", is_package: true }, minutes: 300, price: 110 });
    // 5 hours: booth 90 + 40 = 130 apart, a saving of 15%.
    expect(await screen.findByText(/Save 15%/)).toBeInTheDocument();
  });

  it("speaks Arabic, with the services named in Arabic", async () => {
    state.lang = "ar";
    renderIt({ product: { id: "gold", is_package: true }, minutes: 180, price: 80 });
    expect(await screen.findByText("فوتوبوث")).toBeInTheDocument();
    expect(screen.getByText("ما تشمله الباقة")).toBeInTheDocument();
  });

  it("says nothing for a service that is not a package, or one that saves nothing", async () => {
    state.lang = "en";
    const { container, unmount } = renderIt({
      product: { id: "gold", is_package: false },
      minutes: 180,
      price: 80,
    });
    expect(container).toBeEmptyDOMElement();
    unmount();
    renderIt({ product: { id: "gold", is_package: true }, minutes: 180, price: 100 });
    expect(await screen.findByText("Booth")).toBeInTheDocument();
    expect(screen.queryByText(/Save/)).toBeNull();
  });
});
