import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Shipping & Returns" on a product page. It once read a setting that does not exist, so every
// store showed the same fixed paragraph ("2-4 business days across all GCC countries, returns
// within 14 days") whatever it had written, right under an estimate that said something else.

const store = vi.hoisted(() => ({
  lang: "en" as "ar" | "en",
  settings: {} as Record<string, unknown>,
  returnPolicy: null as Record<string, unknown> | null,
}));
const storefront = vi.hoisted(() => () => ({
  useStorefront: () => ({
    brand: { id: "b1", slug: "store" },
    lang: store.lang,
    t: (ar: string, en: string) => (store.lang === "ar" ? ar : en),
    settings: store.settings,
  }),
  formatPrice: (amount: number, currency: string) => `${amount.toFixed(3)} ${currency}`,
}));
vi.mock("../src/lib/storefront-context", storefront);
vi.mock("@/lib/storefront-context", storefront);
const returnsData = vi.hoisted(() => () => ({
  returnsQueries: {
    policy: () => ({ queryKey: ["return-policy-test"], queryFn: async () => store.returnPolicy }),
  },
}));
vi.mock("../src/lib/data/returns", returnsData);
vi.mock("@/lib/data/returns", returnsData);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: { idx: string } }) => (
    <a href={`/store/page/${params.idx}`}>{children}</a>
  ),
}));

const { ProductAccordion } = await import("../src/components/storefront/ProductAccordion");
const { DeliveryShopperPreview } =
  await import("../src/features/settings/tabs/orders/DeliveryShopperPreview");

const BASE = {
  store_vertical: "fashion",
  currency: "BHD",
  delivery_enabled: true,
  pickup_enabled: false,
  delivery_estimate_enabled: true,
  delivery_fee: 2,
  delivery_estimate_en: "Within 24 hours to Bahrain",
  delivery_estimate_ar: "خلال 24 ساعة داخل البحرين",
  shipping_zones: [],
  pages: [],
};
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const page = (props: Partial<React.ComponentProps<typeof ProductAccordion>> = {}) =>
  render(
    <QueryClientProvider client={client()}>
      <ProductAccordion description="A black abaya." {...props} />
    </QueryClientProvider>,
  );
const open = () => fireEvent.click(screen.getByRole("button", { name: /Shipping & Returns/ }));

beforeEach(() => {
  store.lang = "en";
  store.settings = { ...BASE };
  store.returnPolicy = null;
});

describe("Shipping & Returns on a product page", () => {
  it("says what the store's settings say, and not the old fixed paragraph", () => {
    page();
    open();
    expect(screen.getByText("Within 24 hours to Bahrain")).toBeTruthy();
    expect(screen.getByText("Delivery within Bahrain")).toBeTruthy();
    expect(screen.getByText("2.000 BHD")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/business days|GCC|14 days/);
  });

  it("shows the words the store wrote about shipping and returns", () => {
    store.settings = { ...BASE, shipping_returns_en: "Exchanges within 3 days, unworn." };
    page();
    open();
    expect(screen.getByText("Exchanges within 3 days, unworn.")).toBeTruthy();
  });

  it("states a return window only when the store's return policy has one", async () => {
    page();
    open();
    expect(screen.queryByText("Returns")).toBeNull();
    store.returnPolicy = { return_window_days: 7, policy_terms_en: "With the tags on." };
    page();
    fireEvent.click(screen.getAllByRole("button", { name: /Shipping & Returns/ })[1]);
    await waitFor(() =>
      expect(screen.getByText("Within 7 days of receiving your order")).toBeTruthy(),
    );
    expect(screen.getByText("With the tags on.")).toBeTruthy();
  });

  it("gives a made-to-order piece its own time, and links to the store's policy page", () => {
    store.settings = {
      ...BASE,
      delivery_estimate_tailored_en: "One week from confirmation",
      pages: [{ slug: "shipping-delivery", title_en: "Shipping & Delivery", title_ar: null }],
    };
    page({ deliveryKinds: { ready: false, tailored: true } });
    open();
    expect(screen.getByText("One week from confirmation")).toBeTruthy();
    expect(screen.queryByText("Within 24 hours to Bahrain")).toBeNull();
    expect(screen.getByRole("link", { name: "Shipping & Delivery" }).getAttribute("href")).toBe(
      "/store/page/1",
    );
  });

  it("is in Arabic for an Arabic reader", () => {
    store.lang = "ar";
    page();
    fireEvent.click(screen.getByRole("button", { name: /الشحن والاسترجاع/ }));
    expect(screen.getByText("خلال 24 ساعة داخل البحرين")).toBeTruthy();
    expect(screen.getByText("التوصيل داخل البحرين")).toBeTruthy();
  });

  it("is left out when the store has nothing to say", () => {
    store.settings = { store_vertical: "fashion", delivery_enabled: false, pickup_enabled: false };
    page();
    expect(screen.queryByRole("button", { name: /Shipping & Returns/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Description & Details/ })).toBeTruthy();
  });

  it("gives way to the booking terms on a service", () => {
    page({ bookingTerms: "Free cancellation up to 24 hours before." });
    expect(screen.queryByRole("button", { name: /Shipping & Returns/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Booking & cancellation/ })).toBeTruthy();
  });
});

describe("the preview in the delivery settings", () => {
  const preview = (settings: Record<string, unknown>) =>
    render(
      <QueryClientProvider client={client()}>
        <DeliveryShopperPreview brandId="b1" settings={settings} pages={[]} isAr={false} />
      </QueryClientProvider>,
    );

  it("shows the merchant what a shopper will read, as the form stands", () => {
    preview({ ...BASE, shipping_returns_en: "Typed just now, not saved yet." });
    expect(screen.getByText("Within 24 hours to Bahrain")).toBeTruthy();
    expect(screen.getByText("Typed just now, not saved yet.")).toBeTruthy();
  });

  it("can be read in the other language", () => {
    preview({ ...BASE });
    fireEvent.click(screen.getByRole("button", { name: "عربي" }));
    expect(screen.getByText("خلال 24 ساعة داخل البحرين")).toBeTruthy();
  });

  it("says so when nothing would be shown", () => {
    preview({ delivery_enabled: false, pickup_enabled: false });
    expect(screen.getByText(/Nothing is shown right now/)).toBeTruthy();
  });
});
