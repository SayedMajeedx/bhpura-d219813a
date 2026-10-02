import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The services home page: cards, package offers, the sections it composes.
// The data layer and the pieces with their own tests are faked.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: Record<string, string> }) => (
    <a href={`/${params.slug}/product/${params.id}`}>{children}</a>
  ),
}));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora" },
    lang: "en",
    currency: "BHD",
    t: (_ar: string, en: string) => en,
  }),
  formatPrice: (n: number) => `BHD ${n}`,
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);
const packagesData = {
  servicePackagesQueries: {
    items: () => ({
      queryKey: ["sh-test", "items"],
      queryFn: async () => [
        { package_id: "bundle", product_id: "booth", quantity: 1, sort_order: 0 },
        { package_id: "bundle", product_id: "prints", quantity: 2, sort_order: 1 },
      ],
    }),
  },
  packageLinesById: (rows: Array<{ package_id: string; product_id: string; quantity: number }>) =>
    new Map([
      ["bundle", rows.map((row) => ({ product_id: row.product_id, quantity: row.quantity }))],
    ]),
};
vi.mock("../src/lib/data/service-packages", () => packagesData);
vi.mock("@/lib/data/service-packages", () => packagesData);
const optionsData = {
  serviceOptionsQueries: {
    list: () => ({
      queryKey: ["sh-test", "options"],
      queryFn: async () => [
        {
          id: "o1",
          product_id: "booth",
          name_en: "Guest book",
          name_ar: "كتاب الضيوف",
          mode: "optional",
          price: 5,
          tiers: null,
          is_active: true,
        },
        {
          id: "o2",
          product_id: "booth",
          name_en: "Hidden add-on",
          name_ar: null,
          mode: "optional",
          price: 5,
          tiers: null,
          is_active: false,
        },
      ],
    }),
  },
};
vi.mock("../src/lib/data/service-options", () => optionsData);
vi.mock("@/lib/data/service-options", () => optionsData);
vi.mock("../src/features/storefront-home/components/HeroBanner", () => ({
  HeroBanner: () => <div>hero</div>,
}));
vi.mock("../src/features/storefront-booking/components/BookingEntryPoints", () => ({
  BookingInvite: () => <div>book-invite</div>,
}));
vi.mock("../src/features/store-content/components/StoreGallery", () => ({
  StoreGallery: () => <div>gallery</div>,
}));
vi.mock("../src/features/store-content/components/StoreFaq", () => ({
  StoreFaq: () => <div>faq</div>,
}));

const { ServicesHome } = await import("../src/features/services-home/components/ServicesHome");

const variant = (price: number, minutes: number | null) => ({
  id: `v${price}`,
  selling_price: price,
  original_price: null,
  stock_main: 0,
  size: null,
  color: null,
  duration_minutes: minutes,
});
const base = {
  name_ar: null,
  name_en: null,
  image_url: null,
  item_kind: "service",
  is_package: false,
};
const products = [
  {
    ...base,
    id: "booth",
    name: "Photo booth",
    service_location: "customer",
    extra_hour_price: 15,
    service_includes: [{ ar: "", en: "Instant prints" }],
    product_variants: [variant(40, 60), variant(95, 180)],
  },
  { ...base, id: "prints", name: "Prints", product_variants: [variant(20, null)] },
  {
    ...base,
    id: "bundle",
    name: "Party bundle",
    is_package: true,
    product_variants: [variant(50, 60)],
  },
] as never;

describe("a service's details view", () => {
  it("opens from the card with its lengths, prices, includes and add-ons, and books that service", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ServicesHome products={products} />
      </QueryClientProvider>,
    );
    await screen.findByText(/Guest book/);
    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Length and price")).toBeInTheDocument();
    expect(within(dialog).getByText("BHD 95")).toBeInTheDocument();
    expect(within(dialog).getByText("3 hours")).toBeInTheDocument();
    expect(within(dialog).getByText("Instant prints")).toBeInTheDocument();
    expect(within(dialog).getByText("Guest book")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Book this service" })).toBeInTheDocument();
  });
});

describe("the services home page", () => {
  it("shows the services, the package offer with its saving, and the sections around them", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ServicesHome products={products} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("hero")).toBeInTheDocument();
    expect(screen.getAllByText("book-invite")).toHaveLength(2);
    expect(screen.getByText("gallery")).toBeInTheDocument();
    expect(screen.getByText("faq")).toBeInTheDocument();

    // A service card: from price, lengths, where, includes, extra hour, active add-ons only.
    expect(screen.getByRole("heading", { name: "Photo booth" })).toBeInTheDocument();
    expect(screen.getByText("BHD 40")).toBeInTheDocument();
    expect(screen.getByText("1 hour to 3 hours")).toBeInTheDocument();
    expect(screen.getByText("At your place")).toBeInTheDocument();
    expect(screen.getByText("Instant prints")).toBeInTheDocument();
    expect(screen.getByText(/Extra hour at/)).toBeInTheDocument();
    expect(await screen.findByText(/Guest book/)).toBeInTheDocument();
    expect(screen.queryByText(/Hidden add-on/)).toBeNull();

    // The package: its price against the parts apart (40 + 2 x 20 = 80).
    expect(await screen.findByText("Save 38%")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Party bundle" })).toBeInTheDocument();
    expect(screen.getByText("BHD 80")).toBeInTheDocument();
    expect(screen.getByText("Prints × 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose this package" })).toHaveAttribute(
      "href",
      "/aurora/product/bundle",
    );
  });
});
