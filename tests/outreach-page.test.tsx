import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Clients to message today": the page shows who is worth a message and why, opens WhatsApp with
// the message written, and keeps a record so a client is not offered again for a week. The
// customer's card records whether they agreed to hear from the store, which no screen could.

const NOW = Date.parse("2026-10-20T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const stubs = vi.hoisted(() => ({
  customers: [] as unknown[],
  orders: [] as unknown[],
  log: [] as unknown[],
  carts: [] as unknown[],
  requests: [] as unknown[],
  products: [] as unknown[],
  variants: [] as unknown[],
  consent: null as unknown,
  recordOutreach: vi.fn(async () => undefined),
  setCustomerConsent: vi.fn(async () => undefined),
  invalidateOutreach: vi.fn(async () => undefined),
  setBackInStockTold: vi.fn(async () => 1),
  invalidateLeads: vi.fn(async () => undefined),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: ["test", key],
  queryFn: async () => read(),
});
const mocks: Record<string, unknown> = {
  "data/customers": {
    customersQueries: { audience: () => options("customers", () => stubs.customers) },
  },
  "data/outreach": {
    outreachQueries: {
      orders: () => options("orders", () => stubs.orders),
      log: () => options("log", () => stubs.log),
      consent: () => options("consent", () => stubs.consent),
    },
    recordOutreach: stubs.recordOutreach,
    setCustomerConsent: stubs.setCustomerConsent,
    invalidateOutreach: stubs.invalidateOutreach,
  },
  "data/abandoned-carts": {
    abandonedCartsQueries: { carts: () => options("carts", () => stubs.carts) },
  },
  "data/leads": {
    leadsQueries: { backInStock: () => options("requests", () => stubs.requests) },
    setBackInStockTold: stubs.setBackInStockTold,
    invalidateLeads: stubs.invalidateLeads,
  },
  "data/catalog": {
    catalogQueries: {
      products: () => options("products", () => stubs.products),
      variants: () => options("variants", () => stubs.variants),
    },
  },
  "data/business-settings": {
    businessSettingsQueries: {
      detail: () =>
        options("settings", () => ({
          business_name: "Pura Line",
          currency: "BHD",
          store_vertical: "abayas",
        })),
    },
  },
  "brand-context": { useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura Line" }) },
  i18n: { useI18n: () => ({ lang: "en" }) },
};
vi.mock("../src/lib/data/customers", () => mocks["data/customers"]);
vi.mock("@/lib/data/customers", () => mocks["data/customers"]);
vi.mock("../src/lib/data/outreach", () => mocks["data/outreach"]);
vi.mock("@/lib/data/outreach", () => mocks["data/outreach"]);
vi.mock("../src/lib/data/abandoned-carts", () => mocks["data/abandoned-carts"]);
vi.mock("@/lib/data/abandoned-carts", () => mocks["data/abandoned-carts"]);
vi.mock("../src/lib/data/leads", () => mocks["data/leads"]);
vi.mock("@/lib/data/leads", () => mocks["data/leads"]);
vi.mock("../src/lib/data/catalog", () => mocks["data/catalog"]);
vi.mock("@/lib/data/catalog", () => mocks["data/catalog"]);
vi.mock("../src/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("@/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("../src/lib/brand-context", () => mocks["brand-context"]);
vi.mock("@/lib/brand-context", () => mocks["brand-context"]);
vi.mock("../src/lib/i18n", () => mocks.i18n);
vi.mock("@/lib/i18n", () => mocks.i18n);
vi.mock("@/components/addons/AddonsProvider", () => ({ useAddons: () => ({ addons: [] }) }));
vi.mock("../src/components/addons/AddonsProvider", () => ({ useAddons: () => ({ addons: [] }) }));
vi.mock("sonner", () => ({ toast: stubs.toast }));

const { OutreachPage } = await import("../src/features/outreach/components/OutreachPage");
const { CustomerConsentCard } =
  await import("../src/features/outreach/components/CustomerConsentCard");

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn() as unknown as typeof window.open;
  stubs.customers = [
    {
      id: "c1",
      name: "Fatima Ali",
      phone: "33990016",
      marketing_consent: true,
      opted_out_at: null,
    },
    { id: "c2", name: "مريم", phone: "33445566", marketing_consent: null, opted_out_at: null },
  ];
  stubs.orders = [
    {
      id: "o1",
      customer_id: "c1",
      created_at: daysAgo(30),
      status: "completed",
      delivered_at: null,
      completed_at: null,
      items: [{ product_id: "old", variant_id: "vo", size: "56" }],
    },
    {
      id: "o2",
      customer_id: "c2",
      created_at: daysAgo(40),
      status: "completed",
      delivered_at: null,
      completed_at: null,
      items: [],
    },
  ];
  stubs.products = [
    {
      id: "new",
      name: "Abaya Sahab",
      name_ar: "عباية سحاب",
      is_active: true,
      created_at: daysAgo(2),
    },
  ];
  stubs.variants = [{ id: "nv", product_id: "new", size: "56", stock_main: 2 }];
  stubs.log = [];
  stubs.carts = [];
  stubs.requests = [];
});

describe("the page", () => {
  it("shows who is worth a message and why, with the message written", async () => {
    wrap(<OutreachPage now={NOW} />);
    const card = await screen.findByRole("article", { name: /Fatima Ali: New in their size/ });
    expect(
      within(card).getByText(/1 new piece in the abaya size they buy, 56/),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(
        /Hi Fatima, new pieces just arrived at Pura Line in your abaya size 56/,
      ),
    ).toBeInTheDocument();
    expect(within(card).getByText(/Reply STOP/)).toBeInTheDocument();
    // The client who never said yes is asked first, apart from today's list.
    expect(
      screen.getByRole("heading", { name: /Ask whether they'd like your messages \(1\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /مريم: Ask about messages/ })).toBeInTheDocument();
  });

  it("opens WhatsApp with the message, then records it", async () => {
    wrap(<OutreachPage now={NOW} />);
    const card = await screen.findByRole("article", { name: /Fatima Ali/ });
    fireEvent.click(within(card).getByRole("button", { name: /Open WhatsApp with it/ }));
    const url = (window.open as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url.startsWith("https://wa.me/97333990016?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Abaya Sahab");
    await waitFor(() =>
      expect(stubs.recordOutreach).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          contact: "97333990016",
          reason: "new_in_size",
          kind: "sent",
          customerId: "c1",
        }),
      ),
    );
  });

  it("writes the message in the language chosen, and as edited", async () => {
    wrap(<OutreachPage now={NOW} />);
    const card = await screen.findByRole("article", { name: /Fatima Ali/ });
    fireEvent.click(within(card).getByRole("button", { name: "ع" }));
    expect(
      within(card).getByText(/مرحباً Fatima، وصلتنا في Pura Line قطع جديدة/),
    ).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Edit the message" }));
    fireEvent.change(within(card).getByRole("textbox", { name: "Message" }), {
      target: { value: "Fatima, your size is in!" },
    });
    fireEvent.click(within(card).getByRole("button", { name: /Open WhatsApp with it/ }));
    const url = (window.open as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain("Fatima, your size is in!");
  });

  it("puts a reason away for a week with Not now", async () => {
    wrap(<OutreachPage now={NOW} />);
    const card = await screen.findByRole("article", { name: /Fatima Ali/ });
    fireEvent.click(within(card).getByRole("button", { name: "Not now" }));
    await waitFor(() =>
      expect(stubs.recordOutreach).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ reason: "new_in_size", kind: "skipped" }),
      ),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it("marks a waiting-list request as told once its message is sent", async () => {
    stubs.requests = [
      {
        id: "r1",
        product_id: "new",
        variant_id: "nv",
        channel: "whatsapp",
        contact: "33990016",
        lang: "en",
        notified_at: null,
        created_at: daysAgo(4),
      },
    ];
    wrap(<OutreachPage now={NOW} />);
    const card = await screen.findByRole("article", { name: /Fatima Ali: Back in stock/ });
    fireEvent.click(within(card).getByRole("button", { name: /Open WhatsApp with it/ }));
    await waitFor(() => expect(stubs.setBackInStockTold).toHaveBeenCalledWith("b1", ["r1"]));
  });

  it("records a consent given in person without a message", async () => {
    wrap(<OutreachPage now={NOW} />);
    const card = await screen.findByRole("article", { name: /مريم/ });
    fireEvent.click(within(card).getByRole("button", { name: /Already agreed/ }));
    await waitFor(() =>
      expect(stubs.setCustomerConsent).toHaveBeenCalledWith("b1", { id: "c2", name: "مريم" }, true),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it("says plainly when nobody is due, and what it watches for", async () => {
    stubs.customers = [];
    stubs.orders = [];
    wrap(<OutreachPage now={NOW} />);
    expect(await screen.findByText("Nobody needs a message today")).toBeInTheDocument();
    expect(screen.getByText(/sizes back for whoever asked/)).toBeInTheDocument();
  });
});

describe("the customer's card", () => {
  it("records a yes, and a no as an opt-out", async () => {
    stubs.consent = {
      id: "c2",
      name: "مريم",
      phone: "33445566",
      marketing_consent: null,
      opted_out_at: null,
    };
    wrap(<CustomerConsentCard brandId="b1" customerId="c2" lang="en" />);
    const toggle = await screen.findByRole("switch", { name: "Agreed to hear from us" });
    expect(screen.getByText(/Not asked yet/)).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(stubs.setCustomerConsent).toHaveBeenCalledWith("b1", { id: "c2", name: "مريم" }, true),
    );
  });

  it("says when the client asked to stop", async () => {
    stubs.consent = {
      id: "c2",
      name: "Noor",
      phone: "33445566",
      marketing_consent: false,
      opted_out_at: "2026-10-01T10:00:00Z",
    };
    wrap(<CustomerConsentCard brandId="b1" customerId="c2" lang="en" />);
    expect(await screen.findByText("Asked to stop messages on 01/10/2026.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Agreed to hear from us" })).not.toBeChecked();
  });
});
