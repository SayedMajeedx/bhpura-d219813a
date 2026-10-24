import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductRow } from "../src/lib/data/storefront";

// The quick-order menu home page (`MenuHome`): its tabs and sections, an item's one button, the
// choice sheet, "order again" and the basket bar. The data layer and the hero are faked.

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    tabIndex,
    "aria-hidden": hidden,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    params: Record<string, string>;
    tabIndex?: number;
    "aria-hidden"?: boolean | "true";
    className?: string;
  }) => (
    <a
      href={to.replace("$slug", params.slug).replace("$id", params.id ?? "")}
      tabIndex={tabIndex}
      aria-hidden={hidden}
      className={className}
    >
      {children}
    </a>
  ),
}));

const store = vi.hoisted(() => ({
  cart: [] as Array<Record<string, unknown>>,
  addToCart: vi.fn(),
  updateQty: vi.fn(),
}));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => {
    const cartCount = store.cart.reduce((sum, line) => sum + Number(line.qty), 0);
    return {
      brand: { id: "b1", slug: "bakery" },
      lang: "en",
      currency: "BHD",
      t: (_ar: string, en: string) => en,
      cart: store.cart,
      cartCount,
      cartTotal: store.cart.reduce((sum, line) => sum + Number(line.price) * Number(line.qty), 0),
      addToCart: store.addToCart,
      updateQty: store.updateQty,
    };
  },
  formatPrice: (n: number) => `BHD ${n.toFixed(3)}`,
  pickName: (_lang: string, p: { name_en?: string | null; name: string }) => p.name_en || p.name,
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);

vi.mock("../src/features/storefront-home/components/HeroBanner", () => ({
  HeroBanner: () => <div data-testid="hero" />,
}));
vi.mock("@/features/storefront-home/components/HeroBanner", () => ({
  HeroBanner: () => <div data-testid="hero" />,
}));

const customer = vi.hoisted(() => ({ current: null as { id: string } | null }));
const customerHook = vi.hoisted(() => () => ({
  useCustomer: () => ({ data: customer.current }),
}));
vi.mock("../src/features/storefront-account/hooks/use-customer", customerHook);
vi.mock("@/features/storefront-account/hooks/use-customer", customerHook);

const pastOrders = vi.hoisted(() => ({ rows: [] as unknown[] }));
const customersData = vi.hoisted(() => () => ({
  ownCustomerQueries: {
    orders: (brandId: string, customerId?: string) => ({
      queryKey: ["menu-test", "orders", brandId, customerId],
      queryFn: async () => pastOrders.rows,
      enabled: Boolean(customerId),
    }),
  },
}));
vi.mock("../src/lib/data/customers", customersData);
vi.mock("@/lib/data/customers", customersData);

const beansVariants = [
  { id: "250g", selling_price: 4, stock_main: 3, stock_incubator: 0, size: "250g", color: null },
  { id: "1kg", selling_price: 12, stock_main: 2, stock_incubator: 0, size: "1kg", color: null },
  { id: "5kg", selling_price: 50, stock_main: 0, stock_incubator: 0, size: "5kg", color: null },
];
const storefrontData = vi.hoisted(() => () => ({
  storefrontQueries: {
    product: (_brand: unknown, id: string) => ({
      queryKey: ["menu-test", "product", id],
      queryFn: async () => ({
        id,
        name: "Beans",
        name_en: "Beans",
        item_kind: "product",
        is_made_to_order: false,
        custom_fields: null,
        product_variants: beansVariants,
      }),
    }),
  },
}));
vi.mock("../src/lib/data/storefront", storefrontData);
vi.mock("@/lib/data/storefront", storefrontData);

const axesMock = vi.hoisted(() => () => ({
  useVariantAxes: (_product: unknown, variants: Array<{ size: string | null }>) => [
    {
      key: "size",
      label: "Weight",
      values: [...new Set(variants.map((v) => v.size).filter(Boolean))],
    },
  ],
  formatAxisValue: (_axis: unknown, value: string) => value,
}));
vi.mock("../src/lib/variant-axes", axesMock);
vi.mock("@/lib/variant-axes", axesMock);

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MenuHome } from "../src/features/storefront-home/components/MenuHome";
import { useBottomBarClaimed } from "../src/lib/bottom-bar-store";

const product = (id: string, over: Record<string, unknown> = {}): ProductRow =>
  ({
    id,
    name: id,
    name_en: id[0].toUpperCase() + id.slice(1),
    name_ar: null,
    description: null,
    description_en: null,
    description_ar: null,
    category: null,
    image_url: null,
    media: null,
    brand_id: "b1",
    created_at: "2026-10-01",
    item_kind: "product",
    is_made_to_order: false,
    custom_fields: null,
    product_variants: [
      { id: `${id}-v`, selling_price: 2, stock_main: 5, stock_incubator: 0, size: null },
    ],
    ...over,
  }) as ProductRow;

const products = [
  product("loaf", { category: "bread", description_en: "Sourdough, baked this morning" }),
  product("beans", { category: "coffee", product_variants: beansVariants }),
  product("cake", { category: "bread", is_made_to_order: true }),
  product("gone", {
    category: "coffee",
    product_variants: [{ id: "gone-v", selling_price: 3, stock_main: 0, size: null }],
  }),
];
const categories = [
  { slug: "bread", name_en: "Bread", name_ar: "خبز" },
  { slug: "coffee", name_en: "Coffee", name_ar: "قهوة" },
];

function BottomBarProbe() {
  return <span data-testid="bottom-bar">{useBottomBarClaimed() ? "claimed" : "free"}</span>;
}

const renderMenu = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MenuHome products={products} categories={categories} />
      <BottomBarProbe />
    </QueryClientProvider>,
  );

beforeEach(() => {
  store.cart = [];
  store.addToCart.mockReset();
  store.updateQty.mockReset();
  customer.current = null;
  pastOrders.rows = [];
});
afterEach(() => vi.clearAllMocks());

describe("the menu home page", () => {
  it("shows the store's categories as tabs over their sections, each item with its one button", () => {
    renderMenu();
    expect(screen.getByTestId("hero")).toBeTruthy();
    const tabs = screen.getByRole("navigation", { name: "Menu sections" });
    expect(
      within(tabs)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Bread", "Coffee"]);
    const bread = screen.getByRole("region", { name: "Bread" });
    expect(within(bread).getByRole("link", { name: "Loaf" })).toHaveAttribute(
      "href",
      "/bakery/product/loaf",
    );
    expect(within(bread).getByText("Sourdough, baked this morning")).toBeTruthy();
    expect(within(bread).getByRole("button", { name: "Add Loaf" })).toBeTruthy();
    // A made-to-order piece opens its page.
    expect(within(bread).getByRole("link", { name: "Details Cake" })).toHaveAttribute(
      "href",
      "/bakery/product/cake",
    );

    const coffee = screen.getByRole("region", { name: "Coffee" });
    expect(within(coffee).getByText("From")).toBeTruthy();
    expect(within(coffee).getByRole("button", { name: "Choose Beans" })).toBeTruthy();
    expect(within(coffee).getByText("Sold out")).toBeTruthy();
    // No basket yet: no bar, and the foot of the screen is free.
    expect(screen.queryByRole("link", { name: /Checkout/ })).toBeNull();
    expect(screen.getByTestId("bottom-bar").textContent).toBe("free");
  });

  it("adds an item in one tap, then changes its quantity in place", () => {
    const { rerender } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Add Loaf" }));
    expect(store.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "loaf", variant_id: "loaf-v", qty: 1, price: 2 }),
    );

    store.cart = [{ cart_line_id: "l1", variant_id: "loaf-v", qty: 2, price: 2, max_stock: 5 }];
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MenuHome products={products} categories={categories} />
        <BottomBarProbe />
      </QueryClientProvider>,
    );
    const stepper = screen.getByRole("group", { name: "Loaf in your basket" });
    expect(within(stepper).getByText("2")).toBeTruthy();
    fireEvent.click(within(stepper).getByRole("button", { name: "One less Loaf" }));
    expect(store.updateQty).toHaveBeenCalledWith("l1", 1);
    fireEvent.click(within(stepper).getByRole("button", { name: "One more Loaf" }));
    expect(store.addToCart).toHaveBeenCalledTimes(2);

    // The basket is in reach, and the floating buttons rise above it.
    const bar = screen.getByRole("link", { name: /Checkout/ });
    expect(bar).toHaveAttribute("href", "/bakery/checkout");
    expect(bar.textContent).toContain("2 items");
    expect(bar.textContent).toContain("BHD 4.000");
    expect(screen.getByTestId("bottom-bar").textContent).toBe("claimed");
  });

  it("chooses an item's weight in a sheet, never one for the shopper, and adds that one", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Choose Beans" }));
    const sheet = await screen.findByRole("dialog");
    const weight = await within(sheet).findByRole("group", { name: "Weight" });
    expect(within(sheet).getByRole("button", { name: "Choose first" })).toBeDisabled();
    expect(within(weight).getByRole("button", { name: "5kg" })).toBeDisabled();

    fireEvent.click(within(weight).getByRole("button", { name: "1kg" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "More" }));
    expect(within(sheet).getByRole("button", { name: "More" })).toBeDisabled();
    fireEvent.click(within(sheet).getByRole("button", { name: /Add to basket/ }));
    expect(store.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "beans", variant_id: "1kg", qty: 2, price: 12 }),
    );
  });

  it("offers a signed-in shopper what they ordered before", async () => {
    customer.current = { id: "c1" };
    pastOrders.rows = [
      {
        order_date: "2026-10-20",
        status: "completed",
        order_items: [
          { product_id: "beans", variant_id: "250g" },
          { product_id: "gone", variant_id: "gone-v" },
        ],
      },
    ];
    renderMenu();
    const again = await screen.findByRole("region", { name: "Order again" });
    expect(within(again).getAllByRole("listitem")).toHaveLength(1);
    expect(within(again).getByText("250g")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(again).getByRole("button", { name: "Add Beans" }));
    });
    expect(store.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "beans", variant_id: "250g" }),
    );
  });

  it("says the menu is being prepared when there is nothing on it", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MenuHome products={[]} categories={categories} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("The menu is being prepared.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Menu sections" })).toBeNull();
  });
});
