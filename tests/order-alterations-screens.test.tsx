import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The order's Alterations block on screen (step 3 of docs/workshop-flow-plan.md): sending a
// piece for an alteration with its changed measurement and its price, the store's own workshop,
// order staff who do not price the supplier's work, the alteration's next steps, and the wait
// for unsaved changes.

const stubs = vi.hoisted(() => ({
  createOrderAlteration: vi.fn(),
  setAlterationStatus: vi.fn(async () => undefined),
  alterations: [] as unknown[],
  permissions: ["manage_orders", "view_financials"] as string[],
  finance: true,
  toast: { success: vi.fn(), error: vi.fn() },
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: [key],
  queryFn: async () => read(),
});
const mocks = vi.hoisted(() => ({}) as Record<string, unknown>);
Object.assign(mocks, {
  alterations: {
    alterationQueries: {
      forOrder: () => options("alterations", () => stubs.alterations),
      numbers: () => options("numbers", () => ({})),
    },
    createOrderAlteration: stubs.createOrderAlteration,
    setAlterationStatus: stubs.setAlterationStatus,
  },
  orders: { ordersKeys: { all: (b: string) => ["orders", b] } },
  supplierOrders: { supplierOrderKeys: { all: (b: string) => ["supplier-orders", b] } },
  workshop: {
    workshopQueries: {
      suppliers: () =>
        options("suppliers", () => [
          {
            id: "v1",
            name: "Umm Ali",
            phone: "+97333334444",
            language: "en",
            openOrders: [],
          },
        ]),
      orderPieces: () => options("pieces", () => []),
    },
  },
  accounting: {
    accountingQueries: {
      vendorOptions: () => options("vendors", () => [{ id: "v1", name: "Umm Ali" }]),
    },
    createVendor: vi.fn(),
    invalidateVendors: vi.fn(),
  },
  profile: {
    useProfileOptional: () => ({
      isAdmin: false,
      canViewFinancials: stubs.finance,
      hasPermission: (p: string) => stubs.permissions.includes(p),
    }),
  },
  orderNumber: {
    useOrderNumber: () => (n: number | null, id?: string) => (n ? `#${n}` : `#${id}`),
    useOrderNumberFormat: () => null,
  },
  storeProfile: { useAdminStoreProfile: () => ({ profile: { addons: [], vertical: "abayas" } }) },
  vocabulary: { useVocabulary: () => ({ vocabulary: {} }) },
  currency: { useMoneyLabel: () => "BHD", useStoreCurrency: () => "BHD" },
  activity: { logActivity: vi.fn() },
});
const both = (path: string, key: string) => {
  vi.doMock(`../src/${path}`, () => mocks[key]);
  vi.doMock(`@/${path}`, () => mocks[key]);
};
both("lib/data/orders/alterations", "alterations");
both("lib/data/orders", "orders");
both("lib/data/supplier-orders", "supplierOrders");
both("lib/data/supplier-orders/workshop", "workshop");
both("lib/data/accounting", "accounting");
both("lib/profile-context", "profile");
both("hooks/use-order-number", "orderNumber");
both("hooks/use-store-profile", "storeProfile");
both("hooks/use-vocabulary", "vocabulary");
both("hooks/use-store-currency", "currency");
both("lib/activity-log", "activity");
vi.doMock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.doMock("sonner", () => ({ toast: stubs.toast }));

const { OrderAlterationsCard } =
  await import("../src/features/orders/components/OrderAlterationsCard");

const order = {
  id: "o1",
  invoice_number: 1042,
  status: "confirmed",
  fulfillment_status: "PACKING",
  customer_name_snapshot: "Maryam",
  customer_phone_snapshot: "+97339990000",
};
const items = [
  {
    id: "abaya",
    description: "Black abaya",
    quantity: 1,
    location: "main",
    product_id: "p1",
    custom_field_values: [{ key: "length", label_en: "Length", label_ar: "الطول", value: "56" }],
  },
];

const wrap = (props: Partial<React.ComponentProps<typeof OrderAlterationsCard>> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrderAlterationsCard
        brandId="b1"
        slug="pura"
        order={order}
        items={items}
        products={[]}
        settings={{ offers_alterations: true, business_name: "Pura" }}
        storeName="Pura"
        currency="BHD"
        lang="en"
        {...props}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stubs.alterations = [];
  stubs.permissions = ["manage_orders", "view_financials"];
  stubs.finance = true;
  stubs.createOrderAlteration.mockResolvedValue({
    id: "a1",
    order_id: "o1",
    po_id: null,
    linked: false,
    repeated: false,
  });
});

describe("altering a piece", () => {
  it("sends its changed measurement and price to our workshop, then offers the sheet", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Alter a piece" }));
    const dialog = await screen.findByRole("dialog");
    // A ready piece: an alteration, never a free fix.
    expect(within(dialog).getByRole("radio", { name: /A free fix/ })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Length"), { target: { value: "54" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Our own workshop" }));
    fireEvent.change(within(dialog).getByLabelText("Price for the customer (BHD)"), {
      target: { value: "5" },
    });
    expect(within(dialog).getByText("Added to this order")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "To our workshop" }));
    await waitFor(() =>
      expect(stubs.createOrderAlteration).toHaveBeenCalledWith(
        expect.objectContaining({
          p_source_item_id: "abaya",
          p_kind: "alteration",
          p_made_by: "in_house",
          p_vendor_id: null,
          p_customer_charge: 5,
          p_changes: [
            { key: "length", label_en: "Length", label_ar: "الطول", from: "56", to: "54" },
          ],
        }),
      ),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Print alteration sheet" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Tell the customer it was received" }),
    ).toBeInTheDocument();
  });

  it("waits for a price and a change before it sends", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Alter a piece" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Our own workshop" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "To our workshop" }));
    expect(
      await within(dialog).findByText("Change a measurement or say what to do."),
    ).toBeInTheDocument();
    expect(stubs.createOrderAlteration).not.toHaveBeenCalled();
  });

  it("asks order staff who cannot see costs no supplier's charge", async () => {
    stubs.finance = false;
    stubs.permissions = ["manage_orders"];
    wrap({ order: { ...order, status: "completed", fulfillment_status: "DELIVERED" } });
    fireEvent.click(await screen.findByRole("button", { name: "Alter a piece" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/supplier's charge/)).toBeNull();
    expect(
      within(dialog).getByText("On a new order linked to #1042, with its own invoice"),
    ).toBeInTheDocument();
  });

  it("waits for the order's unsaved changes, and is not offered to staff who do not handle orders", async () => {
    const { unmount } = wrap({ unsaved: true });
    expect(await screen.findByRole("button", { name: "Alter a piece" })).toBeDisabled();
    expect(screen.getByText(/Save the order's changes first/)).toBeInTheDocument();
    unmount();
    stubs.permissions = ["view_financials"];
    wrap();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Alter a piece" })).toBeNull());
  });
});

describe("an alteration on the order", () => {
  it("says what it is and where, and is marked back from our workshop", async () => {
    stubs.alterations = [
      {
        id: "a1",
        order_id: "o1",
        source_order_id: "o1",
        source_item_id: "abaya",
        kind: "alteration",
        changes: [{ label_en: "Length", from: "56", to: "54" }],
        note: null,
        made_by: "in_house",
        purchase_order_item_id: null,
        customer_charge: 5,
        charge_item_id: "charge",
        due_at: null,
        status: "at_workshop",
        created_at: "2026-11-03T10:00:00Z",
        back_at: null,
        handed_over_at: null,
      },
    ];
    wrap();
    expect(await screen.findByText("Alteration · Black abaya")).toBeInTheDocument();
    expect(screen.getByText("At the workshop")).toBeInTheDocument();
    expect(screen.getByText("Length: 56 → 54")).toBeInTheDocument();
    expect(screen.getByText(/In our workshop/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back from the workshop" }));
    await waitFor(() => expect(stubs.setAlterationStatus).toHaveBeenCalledWith("a1", "back"));
    // The piece is out: it is not offered again.
    expect(screen.queryByRole("button", { name: "Alter a piece" })).toBeNull();
  });
});
