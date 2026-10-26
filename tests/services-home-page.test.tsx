import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The services home page: cards, package offers, the sections it composes.
// The data layer and the pieces with their own tests are faked.

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    params: Record<string, string>;
    search?: Record<string, string | number>;
  }) => (
    <a
      href={`${to.replace("$slug", params.slug).replace("$id", params.id ?? "")}${
        search?.service
          ? `?service=${search.service}${search.minutes ? `&minutes=${search.minutes}` : ""}`
          : ""
      }`}
    >
      {children}
    </a>
  ),
}));
const homeSettings = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora" },
    settings: homeSettings.current,
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
const pageOptionsData = {
  bookingPageOptionsQueries: {
    options: () => ({
      queryKey: ["sh-test", "page-options"],
      queryFn: async () => ({ package_style: "shimmer" }),
    }),
  },
};
vi.mock("../src/lib/data/booking-page-options", () => pageOptionsData);
vi.mock("@/lib/data/booking-page-options", () => pageOptionsData);
vi.mock("../src/lib/data/service-options", () => optionsData);
vi.mock("@/lib/data/service-options", () => optionsData);
// The store's reviews (storefront_store_reviews): none unless a test gives some.
const reviewsState = vi.hoisted(() => ({ store: null as unknown }));
const reviewsData = {
  reviewsQueries: {
    store: () => ({
      queryKey: ["sh-test", "store-reviews"],
      queryFn: async () => reviewsState.store,
    }),
  },
};
vi.mock("../src/lib/data/reviews", () => reviewsData);
vi.mock("@/lib/data/reviews", () => reviewsData);
vi.mock("../src/features/storefront-home/components/HeroBanner", () => ({
  HeroBanner: () => <div>hero</div>,
}));
vi.mock("../src/components/storefront/TrustBar", () => ({
  TrustBar: () => <div>trust-bar</div>,
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

// The store's offers, listed once under the invitation to book.
const discountsData = {
  bookingDiscountsQueries: {
    public: () => ({
      queryKey: ["booking-discounts"],
      queryFn: async () => [
        {
          id: "d1",
          name_en: null,
          name_ar: null,
          kind: "percent",
          value: 25,
          min_days: 0,
          max_days: 14,
          weekdays: null,
          product_ids: null,
          valid_from: null,
          valid_to: null,
        },
      ],
    }),
  },
};
vi.mock("../src/lib/data/booking-discounts", () => discountsData);
vi.mock("@/lib/data/booking-discounts", () => discountsData);
const bookingsData = {
  bookingsQueries: {
    publicRules: () => ({
      queryKey: ["public-rules"],
      queryFn: async () => ({ timezone: "Asia/Bahrain" }),
    }),
  },
};
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);

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
    category: "rentals",
    service_location: "customer",
    extra_hour_price: 15,
    service_includes: [{ ar: "", en: "Instant prints" }],
    product_variants: [variant(40, 60), variant(95, 180)],
  },
  {
    ...base,
    id: "prints",
    name: "Prints",
    category: "printing",
    service_includes: [{ ar: "", en: "Gift wrap" }],
    product_variants: [variant(20, null)],
  },
  {
    ...base,
    id: "bundle",
    name: "Party bundle",
    category: "packages",
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
    const booth = screen.getByRole("heading", { name: "Photo booth" }).closest("article")!;
    fireEvent.click(within(booth).getByRole("button", { name: "View details" }));
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
    // The store's offers, once.
    expect(await screen.findAllByText("25% off · within 14 days")).toHaveLength(1);

    // Three kinds, each under its own heading: packages, rentals, services.
    expect(screen.getByRole("heading", { name: "Packages", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rentals", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Services", level: 2 })).toBeInTheDocument();

    // A rental: where and how long, what comes with it, a length with its one price, the add-ons
    // with theirs, and a booking that carries the length chosen. No label above its name.
    const rental = screen.getByRole("heading", { name: "Photo booth" }).closest("article")!;
    expect(rental.className).toContain("rental-card");
    expect(within(rental).queryByText("Rental")).toBeNull();
    expect(within(rental).getByText("At your place")).toBeInTheDocument();
    expect(within(rental).getByText("1–3 hours")).toBeInTheDocument();
    expect(within(rental).getByText("Instant prints")).toBeInTheDocument();
    const lengths = within(rental).getByRole("radiogroup", { name: "Length" });
    expect(within(lengths).getByRole("radio", { name: "1 hour" })).toBeChecked();
    expect(within(rental).getByText("BHD 40")).toBeInTheDocument();
    fireEvent.click(within(lengths).getByRole("radio", { name: "3 hours" }));
    expect(within(rental).getByText("BHD 95")).toBeInTheDocument();
    expect(within(rental).queryByText("BHD 40")).toBeNull();
    expect(within(rental).getByRole("link", { name: "Book 3 hours" })).toHaveAttribute(
      "href",
      "/$slug/book?service=booth&minutes=180".replace("$slug", "aurora"),
    );
    expect(within(rental).getByText(/Each extra hour/)).toBeInTheDocument();
    const guestBook = (await within(rental).findByText(/Guest book/)).closest("li")!;
    expect(within(guestBook).getByText("BHD 5")).toBeInTheDocument();
    expect(screen.queryByText(/Hidden add-on/)).toBeNull();

    // A plain service keeps the plain card: from price and what the booking includes.
    const service = screen.getByRole("heading", { name: "Prints" }).closest("article")!;
    expect(service.className).not.toContain("rental-card");
    expect(service.className).not.toContain("pkg-card");
    expect(within(service).getByText("Gift wrap")).toBeInTheDocument();

    // The package: its price against the parts apart (40 + 2 x 20 = 80).
    expect(await screen.findByText("Save BHD 30 (38%)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Party bundle" })).toBeInTheDocument();
    expect(screen.getByText("BHD 80")).toBeInTheDocument();
    expect(screen.getByText("Prints × 2")).toBeInTheDocument();
    // It wears the merchant's look.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Party bundle" }).closest("article")?.className,
      ).toContain("pkg-card--shimmer"),
    );
    expect(screen.getByRole("link", { name: "Book this package" })).toHaveAttribute(
      "href",
      "/aurora/book?service=bundle",
    );
  });
});

describe("what customers said, on the services home page", () => {
  it("shows the store's reviews when it has some, and nothing when it has none", async () => {
    reviewsState.store = {
      count: 3,
      average: 4.7,
      stars: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 2 },
      highlights: {},
      reviews: [
        {
          id: "r1",
          rating: 5,
          highlights: [],
          comment: "The booth made the night",
          name: "Sara",
          date: "2026-10-20T10:00:00Z",
        },
      ],
    };
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ServicesHome products={products} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Customer reviews" })).toBeInTheDocument();
    expect(screen.getByText("The booth made the night")).toBeInTheDocument();
    unmount();

    reviewsState.store = null;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ServicesHome products={products} />
      </QueryClientProvider>,
    );
    await screen.findByText(/Guest book/);
    expect(screen.queryByRole("heading", { name: "Customer reviews" })).toBeNull();
  });
});

describe("the cards' pictures", () => {
  it("runs a rental's picture across its card, and keeps a service row's pictures in line", () => {
    const withPictures = (products as unknown as Array<Record<string, unknown>>).map((product) =>
      product.id === "booth" ? { ...product, image_url: "https://cdn.example/booth.jpg" } : product,
    );
    const extra = {
      ...(withPictures.find((product) => product.id === "prints") as Record<string, unknown>),
      id: "album",
      name: "Album",
      image_url: "https://cdn.example/album.jpg",
    };
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ServicesHome products={[...withPictures, extra] as never} />
      </QueryClientProvider>,
    );
    const rental = screen.getByRole("heading", { name: "Photo booth" }).closest("article")!;
    // A rental's photo stands whole in its own shape (3:4 unless the store chose one), never the
    // services vertical's wide frame that showed a standing booth's middle half.
    // Whole, never cut: a row taller than the photo shows it over a soft copy of itself.
    expect(within(rental).getByRole("img", { name: "Photo booth" })).toHaveClass("object-contain");
    expect(rental.querySelector("div[aria-hidden='true']")?.className).toContain("aspect-[3/4]");

    // Prints has no picture, Album has one: Prints keeps a picture's space.
    const prints = screen.getByRole("heading", { name: "Prints" }).closest("article")!;
    expect(prints.querySelector("div[aria-hidden='true']")?.className).toContain("aspect-[4/3]");
    // The rental's photo (and its soft copy behind it) and Album's: Prints has none.
    expect(container.querySelectorAll("article img[alt]:not([alt=''])").length).toBe(2);
  });
});

const renderWithQuery = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("the trust bar on the services home page", () => {
  it("shows the bar the store saved under the hero, and nothing when it is off", async () => {
    homeSettings.current = { trust_bar_enabled: true, trust_bar_position: "below_hero" };
    const { unmount } = renderWithQuery(<ServicesHome products={[]} />);
    expect(await screen.findByText("trust-bar")).toBeInTheDocument();
    unmount();
    homeSettings.current = { trust_bar_enabled: false };
    renderWithQuery(<ServicesHome products={[]} />);
    await screen.findByText("hero");
    expect(screen.queryByText("trust-bar")).toBeNull();
    homeSettings.current = {};
  });
});
