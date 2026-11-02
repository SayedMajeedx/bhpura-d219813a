import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backInStockMessage,
  contactLink,
  subscriberCounts,
  subscribersCsv,
  toldRequests,
  waitingGroups,
  type WaitingRequest,
} from "../src/features/leads/lib/leads";

// What shoppers left on the storefront (a request to be told when a product is back, a
// newsletter sign-up) was written and never read: the admin showed a count of the first and
// nothing of the second. The sign-ups page lists both and lets a member of staff answer.

const stubs = vi.hoisted(() => ({
  requests: [] as unknown[],
  subscribers: [] as unknown[],
  products: [] as unknown[],
  variants: [] as unknown[],
  setBackInStockTold: vi.fn(async () => 1),
  deleteBackInStockRequests: vi.fn(async () => undefined),
  deleteNewsletterSubscriber: vi.fn(async () => undefined),
  invalidateLeads: vi.fn(async () => undefined),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: ["test", key],
  queryFn: async () => read(),
});
const leadsData = {
  leadsQueries: {
    backInStock: () => options("requests", () => stubs.requests),
    newsletter: () => options("subscribers", () => stubs.subscribers),
  },
  setBackInStockTold: stubs.setBackInStockTold,
  deleteBackInStockRequests: stubs.deleteBackInStockRequests,
  deleteNewsletterSubscriber: stubs.deleteNewsletterSubscriber,
  invalidateLeads: stubs.invalidateLeads,
};
vi.mock("../src/lib/data/leads", () => leadsData);
vi.mock("@/lib/data/leads", () => leadsData);
const catalog = {
  catalogQueries: {
    products: () => options("products", () => stubs.products),
    variants: () => options("variants", () => stubs.variants),
    variantsWithArchived: () => options("variants", () => stubs.variants),
  },
};
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
const settings = {
  businessSettingsQueries: { detail: () => options("settings", () => ({ business_name: "ZH" })) },
};
vi.mock("../src/lib/data/business-settings", () => settings);
vi.mock("@/lib/data/business-settings", () => settings);
const brand = { useBrand: () => ({ id: "b1", slug: "zh", name_en: "ZH", name_ar: "زد" }) };
vi.mock("../src/lib/brand-context", () => brand);
vi.mock("@/lib/brand-context", () => brand);
const i18n = { useI18n: () => ({ lang: "en" }) };
vi.mock("../src/lib/i18n", () => i18n);
vi.mock("@/lib/i18n", () => i18n);
vi.mock("sonner", () => ({ toast: stubs.toast }));

const { SignupsPage } = await import("../src/features/leads/components/SignupsPage");

const request = (over: Partial<WaitingRequest> = {}): WaitingRequest => ({
  id: "r1",
  product_id: "p1",
  variant_id: "v1",
  channel: "whatsapp",
  contact: "39001122",
  lang: "ar",
  notified_at: null,
  created_at: "2026-10-01T10:00:00Z",
  ...over,
});
const products = [
  { id: "p1", name: "Silk Abaya", name_ar: "عباية حرير", name_en: "Silk Abaya", is_active: true },
  { id: "p2", name: "Scarf", name_ar: "وشاح", name_en: "Scarf", is_active: true },
  { id: "p3", name: "Kaftan", name_ar: "قفطان", name_en: "Kaftan", is_active: false },
  { id: "p4", name: "Bisht", name_en: "Bisht", is_active: true, is_made_to_order: true },
];
const variants = [
  { id: "v1", product_id: "p1", size: "M", color: "Black", stock_main: 0, stock_incubator: 0 },
  { id: "v1b", product_id: "p1", size: "L", color: "Black", stock_main: 4, stock_incubator: 0 },
  { id: "v2", product_id: "p2", size: "Standard", color: "Red", stock_main: 2, stock_incubator: 1 },
  { id: "v3", product_id: "p3", size: "S", color: null, stock_main: 5, stock_incubator: 0 },
];

describe("the waiting list", () => {
  it("groups the people still waiting by what they wait for, what is back first", () => {
    const groups = waitingGroups(
      [
        request({ id: "a", product_id: "p1", variant_id: "v1" }),
        request({
          id: "b",
          product_id: "p1",
          variant_id: "v1",
          contact: "a@b.co",
          channel: "email",
        }),
        request({ id: "c", product_id: "p2", variant_id: "v2" }),
        request({
          id: "d",
          product_id: "p2",
          variant_id: "v2",
          notified_at: "2026-10-02T00:00:00Z",
        }),
      ],
      products,
      variants,
    );
    expect(
      groups.map((group) => [group.productId, group.requests.length, group.backInStock]),
    ).toEqual([
      ["p2", 1, true],
      ["p1", 2, false],
    ]);
    // The size asked for, not the product: another size of the same abaya is in stock.
    expect(groups[1]).toMatchObject({ option: "M · Black", ready: 0 });
    // A placeholder size is not something the shopper chose.
    expect(groups[0]).toMatchObject({ option: "Red", ready: 3 });
  });

  it("does not call a hidden or a deleted product back in stock", () => {
    const groups = waitingGroups(
      [
        request({ id: "a", product_id: "p3", variant_id: "v3" }),
        request({ id: "b", product_id: "gone", variant_id: null }),
      ],
      products,
      variants,
    );
    expect(
      groups.map((group) => [group.productId, group.backInStock, Boolean(group.product)]),
    ).toEqual([
      ["p3", false, true],
      ["gone", false, false],
    ]);
  });

  it("follows the one availability rule for a product asked for as a whole", () => {
    const [whole] = waitingGroups(
      [request({ product_id: "p1", variant_id: null })],
      products,
      variants,
    );
    // Any size in stock.
    expect(whole).toMatchObject({ ready: 4, backInStock: true, option: "" });
    // A made-to-order piece can be bought with no ready stock at all.
    const [made] = waitingGroups(
      [request({ product_id: "p4", variant_id: null })],
      products,
      variants,
    );
    expect(made).toMatchObject({ ready: 0, backInStock: true });
  });

  it("keeps the answered requests apart, newest first", () => {
    const told = toldRequests([
      request({ id: "a" }),
      request({ id: "b", notified_at: "2026-10-02T00:00:00Z" }),
      request({ id: "c", notified_at: "2026-10-05T00:00:00Z" }),
    ]);
    expect(told.map((row) => row.id)).toEqual(["c", "b"]);
  });

  it("writes the message in the shopper's language, with the product and its link", () => {
    const facts = {
      storeName: "ZH",
      option: "M · Black",
      link: "https://zh.boutq.store/zh/product/p1",
    };
    expect(backInStockMessage({ ...facts, name: "Silk Abaya", lang: "en" })).toBe(
      'Hello from ZH. You asked to be told when "Silk Abaya (M · Black)" is back, and it is in stock now:\nhttps://zh.boutq.store/zh/product/p1',
    );
    const arabic = backInStockMessage({ ...facts, name: "عباية حرير", option: "", lang: "ar" });
    expect(arabic).toContain("«عباية حرير»");
    expect(arabic).toContain(facts.link);
  });

  it("opens the shopper's WhatsApp chat or an email, and nothing for a contact it cannot reach", () => {
    expect(contactLink({ channel: "whatsapp", contact: "39001122" }, "hi there", "s")).toBe(
      "https://wa.me/97339001122?text=hi%20there",
    );
    expect(contactLink({ channel: "email", contact: "a@b.co" }, "hi & bye", "ZH: back")).toBe(
      "mailto:a@b.co?subject=ZH%3A%20back&body=hi%20%26%20bye",
    );
    expect(contactLink({ channel: "whatsapp", contact: "12" }, "x", "s")).toBeNull();
    expect(contactLink({ channel: "email", contact: "not-an-address" }, "x", "s")).toBeNull();
  });
});

describe("the newsletter list", () => {
  const rows = [
    {
      id: "1",
      channel: "email",
      contact: "a@b.co",
      lang: "en",
      source: "footer",
      created_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "2",
      channel: "whatsapp",
      contact: "97339001122",
      lang: "ar",
      source: null,
      created_at: "2026-10-02T10:00:00Z",
    },
    {
      id: "3",
      channel: "email",
      contact: '=cmd,"x"@b.co',
      lang: null,
      source: "popup",
      created_at: "2026-10-03T10:00:00Z",
    },
  ];

  it("counts by how each person asked to be reached", () => {
    expect(subscriberCounts(rows)).toEqual({ total: 3, email: 2, whatsapp: 1 });
  });

  it("is a file a spreadsheet opens right, with nothing in it a spreadsheet would run", () => {
    const csv = subscribersCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      "\uFEFFcontact,channel,language,source,signed_up",
      "a@b.co,email,en,footer,2026-10-01",
      "97339001122,whatsapp,ar,,2026-10-02",
      '"\'=cmd,""x""@b.co",email,,popup,2026-10-03',
      "",
    ]);
  });
});

describe("the sign-ups page", () => {
  const open = vi.fn();
  const show = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SignupsPage />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("open", open);
    stubs.products = products;
    stubs.variants = variants;
    stubs.requests = [
      request({ id: "back", product_id: "p2", variant_id: "v2", contact: "39001122", lang: "en" }),
      request({
        id: "out",
        product_id: "p1",
        variant_id: "v1",
        contact: "a@b.co",
        channel: "email",
      }),
    ];
    stubs.subscribers = [
      {
        id: "s1",
        channel: "email",
        contact: "news@b.co",
        lang: "en",
        source: "footer",
        created_at: "2026-10-01T10:00:00Z",
      },
    ];
  });

  it("lists who is waiting, and for what", async () => {
    show();
    expect(await screen.findByText("Scarf")).toBeInTheDocument();
    expect(screen.getByText("Silk Abaya")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Waiting list (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Newsletter (1)" })).toBeInTheDocument();
    expect(screen.getByText("Back in stock")).toBeInTheDocument();
    expect(screen.getByText("Still out of stock")).toBeInTheDocument();
  });

  it("opens the message for someone whose product is back, and marks them as told", async () => {
    show();
    const back = (await screen.findByText("Scarf")).closest("section")!;
    fireEvent.click(within(back).getByRole("button", { name: "Tell them" }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url] = open.mock.calls[0] as [string];
    expect(url.startsWith("https://wa.me/97339001122?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain('"Scarf (Red)" is back');
    expect(decodeURIComponent(url)).toContain("/zh/product/p2");
    await waitFor(() => expect(stubs.setBackInStockTold).toHaveBeenCalledWith("b1", ["back"]));
    await waitFor(() => expect(stubs.invalidateLeads).toHaveBeenCalled());
  });

  it("does not offer to tell someone whose product is still out", async () => {
    show();
    const out = (await screen.findByText("Silk Abaya")).closest("section")!;
    expect(within(out).getByRole("button", { name: "Tell them" })).toBeDisabled();
    // They can still be marked or removed by hand.
    fireEvent.click(within(out).getByRole("button", { name: "Remove request" }));
    await waitFor(() =>
      expect(stubs.deleteBackInStockRequests).toHaveBeenCalledWith("b1", ["out"]),
    );
  });

  it("says so when a change was refused", async () => {
    stubs.setBackInStockTold.mockRejectedValueOnce(new Error("REQUESTS_NOT_FOUND"));
    show();
    const back = (await screen.findByText("Scarf")).closest("section")!;
    fireEvent.click(within(back).getByRole("button", { name: "Mark as told" }));
    await waitFor(() => expect(stubs.toast.error).toHaveBeenCalled());
    expect(stubs.toast.success).not.toHaveBeenCalled();
  });
});
