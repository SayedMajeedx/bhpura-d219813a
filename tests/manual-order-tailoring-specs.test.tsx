import React from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { isOrderDirty, orderItemFromRow } from "../src/features/orders/lib/order-editor";
import { orderItemRow } from "../src/features/orders/lib/order-save";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

const server = vi.hoisted(() => ({ admin: null as unknown, loaderData: null as unknown }));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const adminClient = {
  get supabaseAdmin() {
    return server.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useLoaderData: () => server.loaderData,
  }),
  notFound: () => new Error("not found"),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const profile = { useProfile: () => ({ isAdmin: true }) };
vi.mock("../src/lib/profile-context", () => profile);
vi.mock("@/lib/profile-context", () => profile);
const catalog = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { catalogQueries: object };
  const none = (key: string) => () => ({
    queryKey: ["tailoring-test", key],
    queryFn: async () => [],
  });
  return {
    ...actual,
    catalogQueries: {
      ...actual.catalogQueries,
      products: none("products"),
      variants: none("variants"),
      bomItems: none("bom"),
      packagingMaterials: none("packaging"),
    },
  };
};
vi.mock("../src/lib/data/catalog", (io) => catalog(io));
vi.mock("@/lib/data/catalog", (io) => catalog(io));

const { getPublicInvoice } = (await import("../src/lib/public-invoice.functions")) as unknown as {
  getPublicInvoice: ServerFn;
};
const { Route: invoiceRoute } = (await import("../src/routes/invoice.$id")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};
const { printThermalReceipt } = await import("../src/lib/thermal-print");
const { OrderItemsSection } = await import("../src/components/orders/OrderItemsSection");
const { OrderQuickViewModal } = await import("../src/components/orders/OrderQuickViewModal");

const specs = { size: "52", color: "Black", fabric: "Crepe" };
const fields = [{ key: "sleeve", label_ar: null, label_en: "Sleeve", value: "60" }];
const line = {
  description: "Abaya",
  quantity: 1,
  unit_price: 30,
  customizations: [],
  customization_total: 0,
  line_total: 30,
  location: "custom" as const,
  selected_variant: specs,
  custom_field_values: fields,
};

describe("Custom Tailoring & Made-To-Order Specifications", () => {
  it("persists selected_variant and custom_field_values in order_items creation and updates", () => {
    const row = orderItemRow(line, { user_id: "u1", brand_id: "b1", order_id: "o1" });
    expect(row).toMatchObject({ selected_variant: specs, custom_field_values: fields });
    expect(
      orderItemFromRow({ selected_variant: specs, custom_field_values: fields }),
    ).toMatchObject({ selected_variant: specs, custom_field_values: fields });
  });

  it("returns only the size, colour and fabric on the public invoice, and shows them", async () => {
    const db = fakeSupabase({
      rows: {
        orders: {
          id: "o1",
          brand_id: "b1",
          invoice_number: 1098,
          currency: "BHD",
          total: 30,
          subtotal: 30,
          order_items: [
            {
              ...line,
              // Older admin lines stored the whole variant row.
              selected_variant: { ...specs, cost_price: 12, stock_main: 4 },
            },
          ],
        },
      },
    });
    server.admin = db.supabase;
    const invoice = (await getPublicInvoice({
      data: { id: "7b0c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a11" },
      context: {},
    })) as { order: { order_items: Array<{ selected_variant: unknown }> } };
    expect(invoice.order.order_items[0].selected_variant).toEqual(specs);

    server.loaderData = invoice;
    const Invoice = invoiceRoute.options.component;
    render(<Invoice />);
    for (const value of ["Black", "52", "Crepe"]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
  });

  it("prints custom tailoring specs on thermal POS receipts", () => {
    let html = "";
    const openSpy = vi.spyOn(window, "open").mockReturnValue({
      document: {
        open: () => undefined,
        write: (s: string) => (html += s),
        close: () => undefined,
      },
    } as unknown as Window);
    try {
      printThermalReceipt({
        brand: "Pura",
        invoiceNumber: 1098,
        orderDate: "2026-09-20",
        status: "Completed",
        items: [line],
        subtotal: 30,
        discount: 0,
        taxRate: 0,
        taxAmount: 0,
        shipping: 0,
        total: 30,
        currency: "BHD",
        lang: "en",
        labels: Object.fromEntries(
          [
            "receipt",
            "invoiceNumber",
            "date",
            "status",
            "payment",
            "customer",
            "item",
            "qty",
            "price",
            "total",
            "subtotal",
            "discount",
            "vat",
            "shipping",
            "grandTotal",
            "thankYou",
          ].map((key) => [key, key]),
        ) as never,
      });
    } finally {
      openSpy.mockRestore();
    }
    expect(html).toMatch(/Color: Black/);
    expect(html).toContain("Size / Option: 52");
    expect(html).toMatch(/Fabric: Crepe/);
  });

  it("displays custom variant specs in quick view modal and order items section", () => {
    const order = {
      id: "o1",
      brand_id: "b1",
      invoice_number: 1098,
      currency: "BHD",
      total: 30,
      order_items: [line],
    };
    const items = render(<OrderItemsSection lang="en" order={order} />);
    expect(screen.getByText("Black · 52 · Crepe")).toBeInTheDocument();
    items.unmount();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrderQuickViewModal
          lang="en"
          slug="pura"
          order={order}
          onClose={vi.fn()}
          onCopyInvoice={vi.fn()}
          onPrintThermal={vi.fn()}
          onWhatsAppCustomer={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(within(screen.getByRole("dialog")).getByText("Black · 52 · Crepe")).toBeInTheDocument();
  });

  it("accurately tracks form dirtiness for description, selected_variant, and custom fields", () => {
    const item = { ...line, selected_variant: { size: "52", color: null, fabric: null } };
    const snapshot = { order: { id: "o1", notes: "" }, items: [item] };
    const dirty = (items: (typeof item)[]) => isOrderDirty(snapshot, snapshot.order, items);

    expect(dirty([{ ...item }])).toBe(false);
    expect(dirty([{ ...item, description: " Abaya " }])).toBe(false);
    expect(dirty([{ ...item, description: "Kaftan" }])).toBe(true);
    expect(dirty([{ ...item, selected_variant: { size: "54", color: null, fabric: null } }])).toBe(
      true,
    );
    expect(
      dirty([
        {
          ...item,
          custom_field_values: [{ key: "sleeve", label_ar: null, label_en: "Sleeve", value: "62" }],
        },
      ]),
    ).toBe(true);
    expect(isOrderDirty(snapshot, { id: "o1", notes: "Rush" }, [item])).toBe(true);
  });
});
