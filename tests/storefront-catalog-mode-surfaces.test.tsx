import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./helpers/server-fn";

// Catalog (inquiry-only) storefronts have no cart: every surface that would
// sell falls back to a WhatsApp inquiry, and the public API refuses orders.

const state = vi.hoisted(() => ({
  mode: "catalog",
  navigate: vi.fn(),
  admin: null as unknown,
}));
const storefront = vi.hoisted(() => ({
  brand: { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بورا" },
  settings: {} as Record<string, unknown>,
  lang: "en",
  t: (_ar: string, en: string) => en,
  currency: "BHD",
  cart: [] as unknown[],
  cartTotal: 0,
  wishlist: [] as string[],
  toggleWishlist: () => undefined,
  isWishlisted: () => false,
  addToCart: vi.fn(),
  clearCart: () => undefined,
  session: null,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
  useIsServicesStore: () => false,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
// The browser client (the storefront provider's session and membership checks)
// is a stand-in: CI has no Supabase environment, and nothing here should call out.
const browserClient = {
  supabase: {
    rpc: async () => ({ data: false, error: null }),
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signOut: async () => ({ error: null }),
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => browserClient);
vi.mock("@/integrations/supabase/client", () => browserClient);
// The public API runs with the service-role client and billing faked.
// The router keeps the client it imported, so it gets a stand-in that forwards
// to the fake each test installs.
type FakeClient = ReturnType<typeof fakeSupabase>["supabase"];
const adminClient = {
  supabaseAdmin: {
    rpc: (...args: Parameters<FakeClient["rpc"]>) => (state.admin as FakeClient).rpc(...args),
    from: (table: string) => (state.admin as FakeClient).from(table),
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
const billing = {
  hasFeature: async () => true,
  checkEntitlement: async () => ({ allowed: true }),
  consumeBrandUsage: async () => undefined,
};
vi.mock("../src/lib/saas-billing/entitlements-engine.server", () => billing);
vi.mock("@/lib/saas-billing/entitlements-engine.server", () => billing);
const webhooks = { dispatchBrandWebhookEvent: async () => undefined };
vi.mock("../src/lib/webhooks/webhook-dispatcher.server", () => webhooks);
vi.mock("@/lib/webhooks/webhook-dispatcher.server", () => webhooks);

const { handlePublicApiV1Request } = await import("../src/lib/public-api/public-api-router.server");
const { CartDrawer } = await import("../src/components/storefront/StorefrontCartDrawer");
const { ShareCartModal } = await import("../src/components/storefront/ShareCartModal");
const { ProductCard } = await import("../src/components/storefront/product-card");
const { ProductPurchaseActions } =
  await import("../src/features/product-page/components/ProductPurchaseActions");
const { Route: checkoutRoute } = (await import("../src/routes/$slug.checkout")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};

const catalog = { storefront_mode: "catalog", catalog_show_prices: false };
const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  storefront.settings = catalog;
});

describe("catalog mode is enforced where orders could start", () => {
  it("the public API refuses orders from a catalog-mode brand", async () => {
    const post = async (mode: string) => {
      state.admin = fakeSupabase({
        rows: { business_settings: { storefront_mode: mode } },
        rpc: {
          rpc_validate_api_key_hash: [
            {
              is_valid: true,
              api_key_id: "k1",
              brand_id: "b1",
              brand_slug: "pura",
              brand_name: "Pura",
              scopes: ["orders:write"],
              rate_limit_per_minute: 120,
            },
          ],
        },
      }).supabase;
      const response = await handlePublicApiV1Request(
        new Request("https://boutq.store/api/v1/orders", {
          method: "POST",
          headers: { Authorization: "Bearer bq_live_test", "Content-Type": "application/json" },
          body: JSON.stringify({ items: [] }),
        }),
        {} as never,
      );
      return {
        status: response.status,
        body: (await response.json()) as { error?: { code?: string } },
      };
    };

    const refused = await post("catalog");
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toContain("STOREFRONT_CATALOG_MODE");
    // A shop-mode brand gets past the guard (the empty order then fails validation).
    expect(JSON.stringify((await post("shop")).body)).not.toContain("STOREFRONT_CATALOG_MODE");
  });

  it("the checkout sends catalog shoppers back to the store and renders nothing", () => {
    const Checkout = checkoutRoute.options.component;
    // A cart carried over from before the switch to catalog mode.
    storefront.cart = [{ variant_id: "v1", product_id: "p1", qty: 1, unit_price: 30 }];
    storefront.cartTotal = 30;
    const { container } = withQuery(<Checkout />);
    storefront.cart = [];
    storefront.cartTotal = 0;
    expect(container).toBeEmptyDOMElement();
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/$slug",
      params: { slug: "pura" },
      replace: true,
    });
  });

  it("the cart drawer and the share-cart modal do not render", () => {
    const drawer = render(
      <CartDrawer>
        <button type="button">Cart</button>
      </CartDrawer>,
    );
    expect(drawer.container).toBeEmptyDOMElement();
    drawer.unmount();
    const share = render(<ShareCartModal open onOpenChange={vi.fn()} />);
    expect(share.container).toBeEmptyDOMElement();
  });

  it("the product page offers a WhatsApp inquiry instead of buy buttons", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      render(
        <ProductPurchaseActions
          {...({
            brand: storefront.brand,
            doAdd: vi.fn(),
            errorMsg: null,
            inquiryUrl: "https://wa.me/97339001122?text=Hi",
            isTailoringActive: false,
            lang: "en",
            maxStock: 3,
            product: { id: "p1" },
            qty: 1,
            selectedVariantOutOfStock: false,
            setQty: vi.fn(),
            settings: catalog,
            t: storefront.t,
            variant: { id: "v1", stock_main: 3 },
            vocabulary: {},
          } as never)}
        />,
      );
      expect(screen.queryByRole("button", { name: /add to (cart|bag)/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Inquire via WhatsApp" }));
      expect(open).toHaveBeenCalledWith(
        "https://wa.me/97339001122?text=Hi",
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      open.mockRestore();
    }
  });

  it("product cards hide prices when the catalog hides them", () => {
    const product = {
      id: "p1",
      name: "Silk Abaya",
      name_en: "Silk Abaya",
      base_price: 30,
      original_price: 40,
      image_url: null,
      product_variants: [{ id: "v1", size: "52", selling_price: 30, stock_main: 3 }],
    };
    withQuery(<ProductCard product={product as never} />);
    expect(screen.getByText("Contact us for price")).toBeInTheDocument();
    expect(screen.queryByText(/30\.000/)).not.toBeInTheDocument();
  });
});

describe("product cards and made-to-order stock", () => {
  it("never shows a made-to-order product as sold out", () => {
    storefront.settings = { storefront_mode: "shop" };
    const card = (isMadeToOrder: boolean) => {
      const view = withQuery(
        <ProductCard
          product={
            {
              id: "p1",
              name: "Silk Abaya",
              base_price: 30,
              image_url: null,
              is_made_to_order: isMadeToOrder,
              product_variants: [{ id: "v1", selling_price: 30, stock_main: 0 }],
            } as never
          }
        />,
      );
      const soldOut = Boolean(screen.queryByText("Sold out"));
      view.unmount();
      return soldOut;
    };
    expect(card(false)).toBe(true);
    expect(card(true)).toBe(false);
  });

  it("never shows a service as sold out, even if it was not saved as made to order", () => {
    storefront.settings = { storefront_mode: "shop" };
    const view = withQuery(
      <ProductCard
        product={
          {
            id: "p1",
            name: "Photo booth",
            base_price: 55,
            image_url: null,
            item_kind: "service",
            is_made_to_order: false,
            product_variants: [{ id: "v1", selling_price: 55, stock_main: 0 }],
          } as never
        }
      />,
    );
    expect(screen.queryByText("Sold out")).not.toBeInTheDocument();
    view.unmount();
  });
});

describe("the storefront cart ignores additions in catalog mode", () => {
  it("drops addToCart calls", async () => {
    // The real provider, not the mocked hook above.
    const actual = (await vi.importActual(
      "../src/lib/storefront-context",
    )) as typeof import("../src/lib/storefront-context");
    const { publicSettingsFromPageData } =
      await import("../src/features/storefront-shell/lib/public-settings");
    const brand = { id: "b1", slug: "pura", name_en: "Pura" } as never;
    const settings = publicSettingsFromPageData(brand, {
      brand,
      settings: { storefront_mode: "catalog" },
    } as never);
    let context: ReturnType<typeof actual.useStorefront> | null = null;
    function Probe() {
      context = actual.useStorefront();
      return null;
    }
    withQuery(
      <actual.StorefrontProvider brand={brand} settings={settings}>
        <Probe />
      </actual.StorefrontProvider>,
    );
    act(() =>
      context!.addToCart({
        variant_id: "v1",
        product_id: "p1",
        qty: 1,
        max_stock: 3,
        unit_price: 30,
      } as never),
    );
    expect(context!.cart).toHaveLength(0);
  });
});
