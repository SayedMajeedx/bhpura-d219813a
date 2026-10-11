import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const incubatorData = vi.hoisted(() => ({
  updateIncubator: vi.fn(async () => undefined),
  invalidateIncubators: vi.fn(async () => undefined),
  updateIncubatorItem: vi.fn(async () => undefined),
  syncIncubatorPrices: vi.fn(async () => 3),
  useRealtimeInvalidate: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

// The screen's data: one incubator with 12 stock lines, 12 sales and 12 payments.
const incubator = {
  id: "i1",
  name: "Souq Box",
  contact_name: null,
  phone: null,
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
const twelve = <T,>(row: (n: number) => T) => Array.from({ length: 12 }, (_, i) => row(i + 1));
const rows: Record<string, unknown[]> = {
  list: [incubator],
  inventory: twelve((n) => ({
    id: `s${n}`,
    incubator_id: "i1",
    variant_id: `v${n}`,
    external_code: null,
    quantity: 1,
    consignment_price: 5,
    commission_type: "percentage",
    commission_value: 10,
    product_variants: null,
  })),
  sales: twelve((n) => ({
    id: `sale${n}`,
    incubator_id: "i1",
    variant_id: `v${n}`,
    quantity: 1,
    unit_price: 5,
    gross_amount: 5,
    commission_amount: 0.5,
    net_due: 4.5,
    paid_amount: 4.5,
    sold_at: "2026-09-01T00:00:00Z",
    status: "confirmed",
    product_variants: null,
  })),
  payments: twelve((n) => ({
    id: `pay${n}`,
    incubator_id: "i1",
    amount: 4.5,
    payment_date: "2026-09-02",
    payment_method: "cash",
    reference: `REF-${n}`,
  })),
  // An order took one piece from this partner; a second partner's hold is not shown here.
  orderHolds: [
    {
      order_id: "o-1104",
      variant_id: "v1",
      incubator_id: "i1",
      quantity: 1,
      incubators: { name: "Souq Box", phone: null },
      product_variants: { sku: "AB-1", size: "M", color: "Black", products: { name: "Abaya" } },
      orders: { invoice_number: 1104, status: "confirmed", fulfillment_status: "NEEDS_PACKING" },
    },
    {
      order_id: "o-1105",
      variant_id: "v2",
      incubator_id: "i2",
      quantity: 2,
      incubators: { name: "Other", phone: null },
      product_variants: { sku: "AB-2", products: { name: "Scarf" } },
      orders: { invoice_number: 1105, status: "confirmed", fulfillment_status: "NEEDS_PACKING" },
    },
  ],
  // One variant says 3 pieces are at partners while no partner holds it.
  partnerTotals: [
    { id: "v-lost", sku: "LOST-1", stock_incubator: 3, products: { name: "Lost shawl" } },
  ],
};
const fixture = (name: string) => () => ({
  queryKey: ["incubator-test", name],
  queryFn: async () => rows[name] ?? [],
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
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
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

describe("incubator page management", () => {
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

  it("defaults a new incubator to provider packaging (no cost to the store)", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New incubator" }));
    const dialog = await screen.findByRole("dialog");
    const policy = dialog.querySelector('select[name="packaging_policy"]') as HTMLSelectElement;
    expect(policy.value).toBe("incubator");
  });

  it("edits an item's code, price and commission through the secured update", async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Terms" }))[0]);
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

  it("refreshes by syncing prices with the inventory, and listens for other screens' changes", async () => {
    renderPage();
    const refresh = await screen.findByRole("button", { name: "Refresh" });
    await waitFor(() => expect(refresh).not.toBeDisabled());
    fireEvent.click(refresh);
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

  it("says which pieces store orders took from this partner, with a link to each order", async () => {
    renderPage();
    const notice = (await screen.findByText(/Reserved by store orders/)).closest("div")!;
    expect(within(notice).getByText("1 × Abaya · M / Black")).toBeInTheDocument();
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
    expect(warning).toHaveTextContent("Lost shawl: the product says 3, the partners hold 0");
    // The twelve stock lines carry no total of their own here, so they read as unaccounted too.
    expect(within(warning).getAllByRole("listitem").length).toBeGreaterThan(1);
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
