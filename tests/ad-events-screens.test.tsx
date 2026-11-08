import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The storefront gives each pixel (Meta, TikTok, Snapchat) and the store's server one event id per
// event, and sends the server's copy only while the shopper allowed marketing; the Integrations
// page keeps each platform's token under its pixel and tests it.

const ads = vi.hoisted(() => ({
  sendAdPurchase: vi.fn(async () => ({ meta: { sent: true, received: 1 } })),
  sendAdBrowsingEvent: vi.fn(async () => ({ meta: { sent: true, received: 1 } })),
  testAdPlatform: vi.fn(async () => ({ sent: true, received: 1 })),
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
const { ServerEventsFields } = await import("../src/components/integrations/ServerEventsFields");

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const fbq = vi.fn();
const ttq = { page: vi.fn(), track: vi.fn() };
const snaptr = vi.fn();

function configure(marketingAllowed: boolean, ids: { tiktokId?: string; snapId?: string } = {}) {
  setStorefrontAnalyticsConfig({
    brandId: BRAND,
    gaId: null,
    metaId: "123456789012345",
    ...ids,
    analyticsAllowed: false,
    marketingAllowed,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  Object.assign(window, { fbq, ttq, snaptr });
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
    const sent = ads.sendAdBrowsingEvent.mock.calls[0][0] as unknown as {
      data: { eventId: string; contentIds: string[]; brandId: string };
    };
    expect(sent.data.eventId).toBe(options.eventID);
    expect(sent.data).toMatchObject({ brandId: BRAND, contentIds: ["p1"] });
  });

  it("names a purchase by its order, and the server reads the order", async () => {
    configure(true);
    await trackStorefrontEvent("purchase", { transaction_id: "o-77", value: 10, currency: "BHD" });
    expect(fbq.mock.calls[0][4]).toEqual({ eventID: "purchase:o-77" });
    expect(ads.sendAdPurchase).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: "o-77" }),
    });
  });

  it("sends the ad's click id kept from the landing page", async () => {
    window.history.replaceState(null, "", "/pura?fbclid=IwAR2abcDEF_123");
    rememberAdClick();
    window.history.replaceState(null, "", "/pura/checkout");
    configure(true);
    await trackStorefrontEvent("begin_checkout", { currency: "BHD", value: 5 });
    const sent = ads.sendAdBrowsingEvent.mock.calls[0][0] as unknown as {
      data: { fbc: string };
    };
    expect(sent.data.fbc).toMatch(/^fb\.1\.\d+\.IwAR2abcDEF_123$/);
  });

  it("sends nothing to Meta without the shopper's permission for marketing", async () => {
    configure(false);
    await trackStorefrontEvent("purchase", { transaction_id: "o-78" });
    await trackStorefrontEvent("add_to_cart", {});
    expect(fbq).not.toHaveBeenCalled();
    expect(ads.sendAdPurchase).not.toHaveBeenCalled();
    expect(ads.sendAdBrowsingEvent).not.toHaveBeenCalled();
  });

  it("gives TikTok and Snapchat the same id as Meta and the server", async () => {
    configure(true, {
      tiktokId: "C4ABCD1234567890ABCD",
      snapId: "5c1a2b3d-0000-4000-8000-abcdef012345",
    });
    await trackStorefrontEvent("add_to_cart", { items: [{ item_id: "p1", quantity: 1 }] });
    const eventId = fbq.mock.calls[0][4].eventID;
    expect(ttq.track).toHaveBeenCalledWith("AddToCart", expect.any(Object), { event_id: eventId });
    expect(snaptr).toHaveBeenCalledWith(
      "track",
      "ADD_CART",
      expect.objectContaining({ client_dedup_id: eventId }),
    );
    await trackStorefrontEvent("purchase", { transaction_id: "o-9" });
    expect(snaptr).toHaveBeenLastCalledWith(
      "track",
      "PURCHASE",
      expect.objectContaining({ transaction_id: "o-9" }),
    );
  });

  it("sends a store with only TikTok to the server too", async () => {
    setStorefrontAnalyticsConfig({
      brandId: BRAND,
      gaId: null,
      metaId: null,
      tiktokId: "C4ABCD1234567890ABCD",
      analyticsAllowed: false,
      marketingAllowed: true,
    });
    await trackStorefrontEvent("view_item", { content_ids: ["p1"] });
    expect(fbq).not.toHaveBeenCalled();
    expect(ttq.track).toHaveBeenCalled();
    expect(ads.sendAdBrowsingEvent).toHaveBeenCalled();
  });

  it("keeps a page view the pixel's alone", async () => {
    configure(true);
    await trackStorefrontEvent("page_view", {});
    expect(fbq).toHaveBeenCalled();
    expect(ads.sendAdBrowsingEvent).not.toHaveBeenCalled();
  });
});

function renderFields(platform: "meta" | "tiktok" | "snap" = "meta") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ServerEventsFields platform={platform} brandId={BRAND} isAr={false} pixelOn />
    </QueryClientProvider>,
  );
}

describe("the server events on the Integrations page", () => {
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
    expect(ads.testAdPlatform).toHaveBeenCalledWith({
      data: { brandId: BRAND, platform: "meta", testEventCode: "TEST123" },
    });
  });

  it("saves a TikTok token under its own name", async () => {
    integrations.rows = [];
    renderFields("tiktok");
    fireEvent.change(screen.getByLabelText("Events API (server-side)"), {
      target: { value: "tiktoktokenvalue1234567890abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() =>
      expect(integrations.saveIntegrationCredential).toHaveBeenCalledWith(
        BRAND,
        expect.objectContaining({ provider: "tiktok_events" }),
      ),
    );
  });

  it("tests Snapchat with no code to copy", async () => {
    integrations.rows = [
      { id: "cred-2", provider: "snap_capi", has_api_key: true, api_key_masked: "••••9sig" },
    ];
    renderFields("snap");
    await screen.findByText("••••9sig");
    expect(screen.queryByLabelText("Test")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send test event" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Snapchat checked the event");
    expect(ads.testAdPlatform).toHaveBeenCalledWith({ data: { brandId: BRAND, platform: "snap" } });
  });
});
