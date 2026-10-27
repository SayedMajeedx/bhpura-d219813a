import React from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./helpers/server-fn";

// A store whose prices exclude VAT has the tax added to its order by the database (bug #42):
// the checkout says so, and its total, the phone's bar and the advance asked now are worked
// from the total the order will charge (orderTotals, run against the order builder by
// tests/order-tax-parity.test.ts).

const storefront = vi.hoisted(() => ({
  brand: { id: "b1", slug: "aurora", name_en: "Aurora", name_ar: "أورورا" },
  settings: {} as Record<string, unknown>,
  lang: "en" as "en" | "ar",
  t: (_ar: string, en: string) => en,
  currency: "BHD",
  cart: [] as unknown[],
  cartTotal: 0,
  addToCart: vi.fn(),
  clearCart: () => undefined,
  session: null,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
  useIsServicesStore: () => false,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
// CI has no Supabase environment: the browser client is a stand-in that answers with nothing.
const browserClient = {
  supabase: {
    ...fakeSupabase({ rpc: {} }).supabase,
    rpc: async () => ({ data: null, error: null }),
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => browserClient);
vi.mock("@/integrations/supabase/client", () => browserClient);

const { Route } = (await import("../src/routes/$slug.checkout")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};
const { OrderSummaryCard } = await import("../src/features/checkout/components/OrderSummaryCard");

const abaya = {
  cart_line_id: "l1",
  product_id: "p1",
  variant_id: "v1",
  name: "Linen abaya",
  image: null,
  price: 34,
  qty: 1,
  max_stock: 9,
};

const shop = {
  storefront_mode: "shop",
  delivery_enabled: false,
  pickup_enabled: true,
  cod_enabled: false,
  card_enabled: true,
};

const renderCheckout = () => {
  const Checkout = Route.options.component;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Checkout />
    </QueryClientProvider>,
  );
};

/** The order summary card: the one that holds the Place order button. */
const summary = () => {
  const heading = screen.getByRole("heading", { name: "Order summary" });
  return within(heading.closest("div.sticky") as HTMLElement);
};

beforeEach(() => {
  storefront.cart = [abaya];
  storefront.cartTotal = 34;
  storefront.lang = "en";
});

describe("the checkout of a store whose prices exclude VAT", () => {
  it("shows the VAT and the total the order charges (Aurora: 34.000 became 37.400)", () => {
    storefront.settings = { ...shop, default_tax_rate: 10, vat_inclusive: false };
    renderCheckout();
    const card = summary();
    expect(card.getByText("VAT (10%)")).toBeTruthy();
    expect(card.getByText(/3\.400/)).toBeTruthy();
    expect(card.getByText(/37\.400/)).toBeTruthy();
    // The phone's bar at the foot says the same total.
    expect(screen.getAllByText(/37\.400/).length).toBeGreaterThan(1);
    // The line and the subtotal stay 34.000.
    expect(card.getAllByText(/34\.000$/)).toHaveLength(2);
  });

  it("asks an advance as a share of the total with VAT", () => {
    storefront.settings = {
      ...shop,
      default_tax_rate: 10,
      vat_inclusive: false,
      advance_payment_enabled: true,
      advance_payment_percent: 50,
      advance_payment_scope: "all",
    };
    renderCheckout();
    // Half of 37.400, not of 34.000.
    expect(screen.getAllByText(/18\.700/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/17\.000/)).toBeNull();
  });

  it("writes the tax out in Arabic", () => {
    storefront.settings = { ...shop, default_tax_rate: 10, vat_inclusive: false };
    storefront.lang = "ar";
    const t = storefront.t;
    storefront.t = (ar: string) => ar;
    try {
      renderCheckout();
      expect(screen.getByText("ضريبة القيمة المضافة (10%)")).toBeTruthy();
    } finally {
      storefront.t = t;
    }
  });
});

describe("a store that charges no VAT, or includes it in its prices", () => {
  it("shows no tax line when the store charges none", () => {
    storefront.settings = { ...shop, default_tax_rate: 0 };
    renderCheckout();
    const card = summary();
    expect(card.queryByText(/VAT/)).toBeNull();
    expect(card.getAllByText(/34\.000/).length).toBeGreaterThan(1);
  });

  it("says the VAT is included and does not add it", () => {
    storefront.settings = { ...shop, default_tax_rate: 10, vat_inclusive: true };
    renderCheckout();
    const card = summary();
    // 34.000 includes 34 - 34 / 1.1 = 3.091 of VAT; the total stays 34.000.
    expect(card.getByText(/Includes VAT \(10%\): .*3\.091/)).toBeTruthy();
    expect(card.queryByText("VAT (10%)")).toBeNull();
    expect(card.queryByText(/37\.400/)).toBeNull();
  });

  it("draws no tax when the summary is given none", () => {
    // The summary reads data (the store's currencies for its total's approximation).
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrderSummaryCard
          {...({
            appliedPromo: null,
            availableMethods: [],
            brand: storefront.brand,
            cart: [abaya],
            cartTotal: 34,
            currency: "BHD",
            estimatedDeliveryLines: [],
            estimatedPointsToEarn: 0,
            fulfillment: "pickup",
            fulfillmentOptions: [],
            advance: { applies: false, percent: 0, dueNow: 0, balance: 0 },
            grandTotal: 34,
            lang: "en",
            loyaltyDiscount: 0,
            promoDiscount: 0,
            promoInput: "",
            redeemedPoints: 0,
            shipping: 0,
            t: storefront.t,
          } as unknown as React.ComponentProps<typeof OrderSummaryCard>)}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/VAT/)).toBeNull();
  });
});
