import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The storefront gives the pixel and the store's server one event id per event, and sends the
// server's copy only while the shopper allowed marketing; the Integrations page keeps the
// Conversions API token under the pixel and tests it.

const ads = vi.hoisted(() => ({
  sendMetaPurchase: vi.fn(async () => ({ sent: true, received: 1 })),
  sendMetaBrowsingEvent: vi.fn(async () => ({ sent: true, received: 1 })),
  testMetaConversions: vi.fn(async () => ({ sent: true, received: 1 })),
}));
vi.mock("../src/lib/ad-events.functions", () => ads);
vi.mock("@/lib/ad-events.functions", () => ads);

const funnel = { recordFunnelStep: vi.fn(async () => undefined) };
vi.mock("../src/lib/data/storefront-funnel", () => funnel);
vi.mock("@/lib/data/storefront-funnel", () => funnel);

const integrations = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  saveIntegrationCredential: vi.fn(async () => undefined),
  deleteIntegrationCredential: vi.fn(async () => undefined),
}));
const integrationsModule = {
  integrationsQueries: {
    credentials: (brandId: string) => ({
      queryKey: ["integrations", brandId, "credentials"],
      queryFn: async () => integrations.rows,
    }),
  },
  invalidateIntegrationCredentials: vi.fn(async () => undefined),
  saveIntegrationCredential: integrations.saveIntegrationCredential,
  deleteIntegrationCredential: integrations.deleteIntegrationCredential,
};
vi.mock("../src/lib/data/integrations", () => integrationsModule);
vi.mock("@/lib/data/integrations", () => integrationsModule);

const { trackStorefrontEvent, setStorefrontAnalyticsConfig, rememberAdClick } =
  await import("../src/lib/storefront-analytics");
const { MetaConversionsFields } =
  await import("../src/components/integrations/MetaConversionsFields");

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const fbq = vi.fn();

function configure(marketingAllowed: boolean) {
  setStorefrontAnalyticsConfig({
    brandId: BRAND,
    gaId: null,
    metaId: "123456789012345",
    analyticsAllowed: false,
    marketingAllowed,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  (window as unknown as { fbq: typeof fbq }).fbq = fbq;
});

describe("one event id for the pixel and the server", () => {
  it("gives an add to bag the same id on both sides", async () => {
    configure(true);
    await trackStorefrontEvent("add_to_cart", {
      currency: "BHD",
      value: 15,
      items: [{ item_id: "p1", price: 15, quantity: 1 }],
    });
    const [, , name, payload, options] = fbq.mock.calls[0];
    expect(name).toBe("AddToCart");
    expect(payload).toMatchObject({ content_ids: ["p1"], num_items: 1 });
    const sent = ads.sendMetaBrowsingEvent.mock.calls[0][0] as unknown as {
      data: { eventId: string; contentIds: string[]; brandId: string };
    };
    expect(sent.data.eventId).toBe(options.eventID);
    expect(sent.data).toMatchObject({ brandId: BRAND, contentIds: ["p1"] });
  });

  it("names a purchase by its order, and the server reads the order", async () => {
    configure(true);
    await trackStorefrontEvent("purchase", { transaction_id: "o-77", value: 10, currency: "BHD" });
    expect(fbq.mock.calls[0][4]).toEqual({ eventID: "purchase:o-77" });
    expect(ads.sendMetaPurchase).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: "o-77" }),
    });
  });

  it("sends the ad's click id kept from the landing page", async () => {
    window.history.replaceState(null, "", "/pura?fbclid=IwAR2abcDEF_123");
    rememberAdClick();
    window.history.replaceState(null, "", "/pura/checkout");
    configure(true);
    await trackStorefrontEvent("begin_checkout", { currency: "BHD", value: 5 });
    const sent = ads.sendMetaBrowsingEvent.mock.calls[0][0] as unknown as {
      data: { fbc: string };
    };
    expect(sent.data.fbc).toMatch(/^fb\.1\.\d+\.IwAR2abcDEF_123$/);
  });

  it("sends nothing to Meta without the shopper's permission for marketing", async () => {
    configure(false);
    await trackStorefrontEvent("purchase", { transaction_id: "o-78" });
    await trackStorefrontEvent("add_to_cart", {});
    expect(fbq).not.toHaveBeenCalled();
    expect(ads.sendMetaPurchase).not.toHaveBeenCalled();
    expect(ads.sendMetaBrowsingEvent).not.toHaveBeenCalled();
  });

  it("keeps a page view the pixel's alone", async () => {
    configure(true);
    await trackStorefrontEvent("page_view", {});
    expect(fbq).toHaveBeenCalled();
    expect(ads.sendMetaBrowsingEvent).not.toHaveBeenCalled();
  });
});

function renderFields() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MetaConversionsFields brandId={BRAND} isAr={false} pixelOn />
    </QueryClientProvider>,
  );
}

describe("the Conversions API on the Integrations page", () => {
  it("saves a pasted token as the store's encrypted key", async () => {
    integrations.rows = [];
    renderFields();
    fireEvent.change(screen.getByLabelText("Conversions API (server-side)"), {
      target: { value: "  EAAGtesttokenvalue1234567890abcdef " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() =>
      expect(integrations.saveIntegrationCredential).toHaveBeenCalledWith(
        BRAND,
        expect.objectContaining({
          id: null,
          provider: "meta_capi",
          apiKey: "EAAGtesttokenvalue1234567890abcdef",
        }),
      ),
    );
  });

  it("shows a saved token masked and says what the test answered", async () => {
    integrations.rows = [
      { id: "cred-1", provider: "meta_capi", has_api_key: true, api_key_masked: "••••cdef" },
    ];
    renderFields();
    expect(await screen.findByText("••••cdef")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Test"), { target: { value: "TEST123" } });
    fireEvent.click(screen.getByRole("button", { name: "Send test event" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Meta received the event");
    expect(ads.testMetaConversions).toHaveBeenCalledWith({
      data: { brandId: BRAND, testEventCode: "TEST123" },
    });
  });
});
