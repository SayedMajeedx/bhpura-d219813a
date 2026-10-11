import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The partners' page, drawn with its data layer mocked: one active partner with 12 stock
// lines, 12 sales and 12 payments, and one inactive partner.

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const incubatorData = vi.hoisted(() => ({
  createIncubator: vi.fn(async () => undefined),
  updateIncubator: vi.fn(async () => undefined),
  invalidateIncubators: vi.fn(async () => undefined),
  updateIncubatorItem: vi.fn(async () => undefined),
  recordIncubatorSale: vi.fn(async () => undefined),
  recordIncubatorPayment: vi.fn(async () => undefined),
  reverseIncubatorSale: vi.fn(async () => undefined),
  syncIncubatorPrices: vi.fn(async () => 3),
  useRealtimeInvalidate: vi.fn(),
}));
const session = vi.hoisted(() => ({ financials: true, currency: "BHD", asked: [] as string[] }));
vi.mock("sonner", () => ({ toast }));

const partner = {
  id: "i1",
  name: "Souq Box",
  contact_name: null,
  phone: "33112233",
  email: null,
  commission_type: "percentage",
  commission_value: 10,
  settlement_day: null,
  currency: "BHD",
  notes: null,
  is_active: true,
  packaging_policy: "incubator",
  fixed_packaging_cost: 0,
};
const variant = (n: number) => ({
  id: `v${n}`,
  sku: `AB-${n}`,
  barcode: null,
  size: "M",
  color: "Black",
  stock_main: 0,
  stock_incubator: 1,
  selling_price: 5,
  products: { name: `Abaya ${n}`, name_ar: `عباية ${n}` },
});
const twelve = <T,>(row: (n: number) => T) => Array.from({ length: 12 }, (_, i) => row(i + 1));
const rows: Record<string, unknown> = {
  list: [partner, { ...partner, id: "i2", name: "Arcade", phone: null, is_active: false }],
  inventory: twelve((n) => ({
    id: `s${n}`,
    incubator_id: "i1",
    variant_id: `v${n}`,
    external_code: null,
    quantity: 1,
    consignment_price: 5,
    commission_type: "percentage",
    commission_value: 10,
    product_variants: variant(n),
  })),
  // The first sale is unpaid, the second was reversed, the rest are paid.
  sales: twelve((n) => ({
    id: `sale${n}`,
    incubator_id: "i1",
    variant_id: `v${n}`,
    quantity: 1,
    unit_price: 5,
    gross_amount: 5,
    commission_amount: 0.5,
    net_due: 4.5,
    paid_amount: n <= 2 ? 0 : 4.5,
    sold_at: "2026-09-01T09:00:00Z",
    status: n === 2 ? "reversed" : "confirmed",
    reversal_reason: n === 2 ? "Returned by the buyer" : null,
    product_cost_snapshot: 2,
    packaging_cost_snapshot: 0.25,
    product_variants: variant(n),
  })),
  payments: twelve((n) => ({
    id: `pay${n}`,
    incubator_id: "i1",
    amount: 4.5,
    payment_date: "2026-09-02",
    payment_method: "cash",
    reference: `REF-${n}`,
  })),
  allocations: [{ payment_id: "pay1", sale_id: "sale3", amount: 4.5 }],
  movements: {
    total: 2,
    rows: [
      {
        id: "m1",
        incubator_id: "i1",
        variant_id: "v1",
        movement_type: "order_reserve",
        quantity_delta: -1,
        reference_type: "order",
        reference_id: "o-1104",
        notes: "Reserved by an order",
        occurred_at: "2026-09-03T10:00:00Z",
        product_variants: variant(1),
      },
      {
        id: "m2",
        incubator_id: "i1",
        variant_id: "v1",
        movement_type: "transfer_in",
        quantity_delta: 3,
        reference_type: null,
        reference_id: null,
        notes: "Weekend restock",
        occurred_at: "2026-09-01T10:00:00Z",
        product_variants: variant(1),
      },
    ],
  },
  // An order took one piece from this partner; another partner's hold is not shown here.
  orderHolds: [
    {
      order_id: "o-1104",
      variant_id: "v1",
      incubator_id: "i1",
      quantity: 1,
      incubators: { name: "Souq Box", phone: null },
      product_variants: variant(1),
      orders: { invoice_number: 1104, status: "confirmed", fulfillment_status: "NEEDS_PACKING" },
    },
    {
      order_id: "o-1105",
      variant_id: "v2",
      incubator_id: "i2",
      quantity: 2,
      incubators: { name: "Arcade", phone: null },
      product_variants: { sku: "SC-1", products: { name: "Scarf" } },
      orders: { invoice_number: 1105, status: "confirmed", fulfillment_status: "NEEDS_PACKING" },
    },
  ],
  // Every piece agrees with its partner, except one total that no partner holds.
  partnerTotals: [
    ...twelve((n) => ({ ...variant(n) })),
    { id: "v-lost", sku: "LOST-1", stock_incubator: 3, products: { name: "Lost shawl" } },
  ],
  products: [],
};
const fixture = (name: string) => () => ({
  queryKey: ["incubator-test", name],
  queryFn: async () => {
    session.asked.push(name);
    return rows[name] ?? [];
  },
});
const incubatorsModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  incubatorsQueries: Object.fromEntries(Object.keys(rows).map((name) => [name, fixture(name)])),
  ...incubatorData,
});
vi.mock("../src/lib/data/incubators", (importOriginal) => incubatorsModule(importOriginal));
vi.mock("@/lib/data/incubators", (importOriginal) => incubatorsModule(importOriginal));
const catalogModule = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { catalogQueries: object };
  return {
    ...actual,
    catalogQueries: { ...actual.catalogQueries, products: fixture("products") },
  };
};
vi.mock("../src/lib/data/catalog", (importOriginal) => catalogModule(importOriginal));
vi.mock("@/lib/data/catalog", (importOriginal) => catalogModule(importOriginal));
const settingsModule = {
  businessSettingsQueries: {
    detail: () => ({
      queryKey: ["incubator-test", "settings"],
      queryFn: async () => ({ currency: session.currency }),
    }),
  },
};
vi.mock("../src/lib/data/business-settings", () => settingsModule);
vi.mock("@/lib/data/business-settings", () => settingsModule);
const brandContext = {
  useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" }),
};
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const profileContext = { useProfile: () => ({ canViewFinancials: session.financials }) };
vi.mock("../src/lib/profile-context", () => profileContext);
vi.mock("@/lib/profile-context", () => profileContext);
const realtime = { useRealtimeInvalidate: incubatorData.useRealtimeInvalidate };
vi.mock("../src/hooks/use-realtime-invalidate", () => realtime);
vi.mock("@/hooks/use-realtime-invalidate", () => realtime);
const transferModal = { BatchIncubatorTransferModal: () => null };
vi.mock("../src/components/incubators/BatchIncubatorTransferModal", () => transferModal);
vi.mock("@/components/incubators/BatchIncubatorTransferModal", () => transferModal);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  redirect: vi.fn(),
  Link: ({ children, params }: { children: React.ReactNode; params: { id: string } }) => (
    <a href={`/orders/${params.id}`}>{children}</a>
  ),
}));

const { Route } = await import("../src/routes/_authenticated/admin.b.$slug.incubators");
const { I18nProvider } = await import("../src/lib/i18n");
const IncubatorsPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  session.financials = true;
  session.currency = "BHD";
  session.asked = [];
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <IncubatorsPage />
      </I18nProvider>
    </QueryClientProvider>,
  );

const openTab = (name: string) =>
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
/** The stock table (the page also draws a card per piece for phones). */
const stockTable = async () => within(await screen.findByRole("table"));

describe("a partner's details and stock", () => {
  it("edits the current incubator's details for its brand", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit incubator" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByDisplayValue("Souq Box");
    fireEvent.change(name, { target: { value: "  Souq Box Seef " } });
    fireEvent.change(dialog.querySelector('select[name="is_active"]')!, {
      target: { value: "false" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save and update" }));
    await waitFor(() => expect(incubatorData.updateIncubator).toHaveBeenCalledTimes(1));
    expect(incubatorData.updateIncubator).toHaveBeenCalledWith(
      "b1",
      "i1",
      expect.objectContaining({ name: "Souq Box Seef", is_active: false }),
    );
  });

  it("creates a partner in the store's own currency, with provider packaging by default", async () => {
    session.currency = "KWD";
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New incubator" }));
    const dialog = await screen.findByRole("dialog");
    const policy = dialog.querySelector('select[name="packaging_policy"]') as HTMLSelectElement;
    expect(policy.value).toBe("incubator");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Marina Mall" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save and update" }));
    await waitFor(() => expect(incubatorData.createIncubator).toHaveBeenCalledTimes(1));
    expect(incubatorData.createIncubator).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ name: "Marina Mall", brand_id: "b1", currency: "KWD" }),
    );
  });

  it("refuses details that make no sense before asking the database", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New incubator" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Marina Mall" } });
    fireEvent.change(within(dialog).getByLabelText("Commission value"), {
      target: { value: "140" },
    });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("A commission percentage cannot exceed 100"),
    );
    expect(incubatorData.createIncubator).not.toHaveBeenCalled();
  });

  it("paginates stock, sales and payments independently", async () => {
    renderPage();
    expect(await screen.findByText("Showing 1-10 of 12 variants")).toBeInTheDocument();
    // Move the stock list to page 2; the other lists still start on page 1.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Showing 11-12 of 12 variants")).toBeInTheDocument();

    openTab("Sales");
    expect(await screen.findByText("Showing 1-10 of 12 sales")).toBeInTheDocument();
    openTab("Payments");
    expect(await screen.findByText("Showing 1-10 of 12 payments")).toBeInTheDocument();
    expect(screen.getByText("REF-10")).toBeInTheDocument();
    expect(screen.queryByText("REF-11")).not.toBeInTheDocument();
  });

  it("shows each piece with its price and commission, as a table and as cards for phones", async () => {
    renderPage();
    const table = await stockTable();
    expect(table.getByText("Abaya 1 · M / Black")).toBeInTheDocument();
    expect(table.getAllByText(/5\.000.*10%/).length).toBeGreaterThan(0);
    // The same pieces as a list of cards (shown instead of the table on a phone).
    const cards = screen.getAllByRole("list").find((list) => list.className.includes("sm:hidden"))!;
    expect(within(cards).getByText("Abaya 1 · M / Black")).toBeInTheDocument();
    expect(within(cards).getAllByRole("button", { name: "Sold" })).toHaveLength(10);
  });

  it("edits an item's code, price and commission through the secured update", async () => {
    renderPage();
    fireEvent.click((await stockTable()).getAllByRole("button", { name: "Terms" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Incubator code"), {
      target: { value: " SB-7 " },
    });
    fireEvent.change(within(dialog).getByLabelText("Consignment price"), {
      target: { value: "6.5" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save and update" }));
    await waitFor(() => expect(incubatorData.updateIncubatorItem).toHaveBeenCalledTimes(1));
    expect(incubatorData.updateIncubatorItem).toHaveBeenCalledWith({
      inventoryId: "s1",
      externalCode: "SB-7",
      consignmentPrice: 6.5,
      commissionType: "percentage",
      commissionValue: 10,
    });
  });

  it("does not record a sale of more pieces than the partner holds", async () => {
    renderPage();
    fireEvent.click((await stockTable()).getAllByRole("button", { name: "Sold" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Sold quantity"), { target: { value: "4" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The partner holds only 1"));
    expect(incubatorData.recordIncubatorSale).not.toHaveBeenCalled();
  });

  it("syncs prices with the inventory, and listens for other screens' changes", async () => {
    renderPage();
    const sync = await screen.findByRole("button", { name: "Sync prices" });
    await waitFor(() => expect(sync).not.toBeDisabled());
    fireEvent.click(sync);
    await waitFor(() => expect(incubatorData.syncIncubatorPrices).toHaveBeenCalledWith("i1"));
    expect(toast.success).toHaveBeenCalledWith("3 product prices updated");
    // Realtime refreshes the incubator tables edited on other screens.
    const tables = (
      incubatorData.useRealtimeInvalidate.mock.calls[0][0] as Array<{ table: string }>
    ).map((entry) => entry.table);
    expect(tables).toEqual(
      expect.arrayContaining(["incubators", "incubator_inventory", "incubator_sales"]),
    );
  });

  it("marks an inactive partner, and sends it no stock", async () => {
    renderPage();
    const chip = await screen.findByRole("button", { name: /Arcade/ });
    expect(chip).toHaveTextContent("Inactive");
    fireEvent.click(chip);
    expect(await screen.findByText("Inactive: no stock can be sent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transfer stock" })).toBeDisabled();
  });
});

describe("what the page says about orders and totals", () => {
  it("says which pieces store orders took from this partner, with a link to each order", async () => {
    renderPage();
    const notice = (await screen.findByText(/Reserved by store orders/)).closest("div")!;
    expect(within(notice).getByText("1 × Abaya 1 · M / Black")).toBeInTheDocument();
    expect(within(notice).getByRole("link", { name: "Order #1104" })).toHaveAttribute(
      "href",
      "/orders/o-1104",
    );
    // Another partner's piece is on that partner's page, not this one.
    expect(screen.queryByText(/Scarf/)).toBeNull();
  });

  it("warns when a product's total at partners is not what the partners hold", async () => {
    renderPage();
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("does not match what the partners hold");
    expect(within(warning).getAllByRole("listitem")).toHaveLength(1);
    expect(warning).toHaveTextContent("Lost shawl: the product says 3, the partners hold 0");
  });

  it("lays the page out right-to-left with Bahraini money formatting in Arabic", async () => {
    localStorage.setItem("lang", "ar");
    const { container } = renderPage();
    expect(await screen.findByText("الحاضنات والعُهد")).toBeInTheDocument();
    expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
    const money = new Intl.NumberFormat("ar-BH", { style: "currency", currency: "BHD" })
      .formatToParts(1)
      .find((part) => part.type === "currency")!.value;
    await waitFor(() => expect(container.textContent).toContain(money));
  });
});

describe("a partner's sales", () => {
  const firstSale = async () => {
    openTab("Sales");
    // The same piece is also named in the "reserved by store orders" notice above the tabs.
    const panel = await screen.findByRole("tabpanel");
    return (await within(panel).findByText("1 × Abaya 1 · M / Black")).closest(
      "div.p-4",
    ) as HTMLElement;
  };

  it("show what was agreed on each sale, and what is still owed", async () => {
    renderPage();
    await screen.findByText("Showing 1-10 of 12 variants");
    const sale = within(await firstSale());
    for (const label of ["Unit price", "Sale total", "Commission", "Due to us", "Still owed"]) {
      expect(sale.getByText(label)).toBeInTheDocument();
    }
    expect(sale.getByText("Due")).toBeInTheDocument();
    expect(sale.getByText("Profit after costs")).toBeInTheDocument();
    // 4.500 due to us, less 2.000 of cost and 0.250 of packaging.
    expect(sale.getByText(/2\.250/)).toBeInTheDocument();
    // A reversed sale says why, and a paid one says so.
    expect(screen.getByText("Returned by the buyer")).toBeInTheDocument();
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
  });

  it("keep the profit from staff who may not see costs", async () => {
    session.financials = false;
    renderPage();
    await screen.findByText("Showing 1-10 of 12 variants");
    await firstSale();
    expect(screen.queryByText("Profit after costs")).toBeNull();
  });

  it("are reversed through a confirmation in the page, never the browser's own box", async () => {
    const browserConfirm = vi.spyOn(window, "confirm");
    renderPage();
    await screen.findByText("Showing 1-10 of 12 variants");
    const sale = within(await firstSale());
    fireEvent.click(sale.getByRole("button", { name: "Reverse" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("The pieces go back to the partner's stock");
    fireEvent.click(within(confirm).getByRole("button", { name: "Reverse the sale" }));
    await waitFor(() =>
      expect(incubatorData.reverseIncubatorSale).toHaveBeenCalledWith("sale1", expect.any(String)),
    );
    expect(browserConfirm).not.toHaveBeenCalled();
    // Only an unpaid, confirmed sale can be reversed: one button on this page of ten.
    expect(screen.queryAllByRole("button", { name: "Reverse" }).length).toBeLessThanOrEqual(1);
  });
});

describe("a partner's payments and history", () => {
  it("show which sales a payment settled", async () => {
    renderPage();
    await screen.findByText("Showing 1-10 of 12 variants");
    openTab("Payments");
    const payment = (await screen.findByText("REF-1")).closest("div.p-4") as HTMLElement;
    expect(within(payment).getByText("It settled these sales")).toBeInTheDocument();
    expect(within(payment).getByText(/1 × Abaya 3 · M \/ Black/)).toBeInTheDocument();
  });

  it("say a refusal in words, in the page's language", async () => {
    incubatorData.recordIncubatorPayment.mockRejectedValueOnce(
      new Error("PAYMENT_EXCEEDS_AMOUNT_DUE"),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "4.5" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("The payment is more than the partner owes"),
    );
    // The form stays open so the amount can be corrected.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("read the history only when its tab is opened, with a link to the order behind a line", async () => {
    renderPage();
    await screen.findByText("Showing 1-10 of 12 variants");
    expect(session.asked).not.toContain("movements");
    openTab("History");
    expect(await screen.findByText("Taken by a store order")).toBeInTheDocument();
    expect(session.asked).toContain("movements");
    expect(screen.getByText("−1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the order" })).toHaveAttribute(
      "href",
      "/orders/o-1104",
    );
    expect(screen.getByText("Sent to the partner")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("Weekend restock")).toBeInTheDocument();
    // The database's own English note on an order's movement is not shown: the label says it.
    expect(screen.queryByText("Reserved by an order")).toBeNull();
  });
});

describe("a partner's statement", () => {
  const openStatement = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Statement" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Everything" }));
    return dialog;
  };

  it("adds up the period and says what is owed today", async () => {
    const dialog = await openStatement();
    // Eleven confirmed sales (one was reversed) and twelve payments.
    await waitFor(() => expect(dialog).toHaveTextContent("Pieces sold11"));
    expect(dialog).toHaveTextContent("lists 11 sales and 12 payments");
    expect(within(dialog).getByText("Balance due today")).toBeInTheDocument();
  });

  it("prints a page with the partner, the store and the figures", async () => {
    const written: string[] = [];
    const sheet = {
      document: { open: vi.fn(), write: (html: string) => written.push(html), close: vi.fn() },
    };
    vi.mocked(window.open).mockReturnValueOnce(sheet as unknown as Window);
    const dialog = await openStatement();
    await waitFor(() => expect(dialog).toHaveTextContent("Pieces sold11"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Print the statement" }));
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("Statement of account");
    expect(written[0]).toContain("Souq Box");
    expect(written[0]).toContain("Pura Line");
    expect(written[0]).toContain("Abaya 1 · M / Black");
  });

  it("offers the summary on WhatsApp to the partner's own number, for a person to send", async () => {
    const dialog = await openStatement();
    const link = within(dialog).getByRole("link", { name: "Send the summary on WhatsApp" });
    const href = link.getAttribute("href")!;
    expect(href.startsWith("https://wa.me/33112233?text=")).toBe(true);
    const message = decodeURIComponent(href.split("text=")[1]);
    expect(message).toContain("Hello Souq Box, here is your statement from Pura Line.");
    expect(message).toContain("Balance due today");
  });
});
