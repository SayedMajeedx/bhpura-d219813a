import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Changing a custom order after it was placed, on screen (step 4 of docs/workshop-flow-plan.md):
// "Change measurements" sends only what changed with its note; it waits for unsaved edits and
// stops once the piece is made; a supplier holding the earlier sheet is shown it, and printing
// the revised sheet or messaging them records that they were told; the history says who changed
// what; and the supplier order's line says its supplier is behind.

const stubs = vi.hoisted(() => ({
  amend: vi.fn(async () => ({
    revision: 2,
    changes: [],
    withSupplier: false,
    supplierBehind: false,
  })),
  told: vi.fn(async () => ({ revision: 2, told: true })),
  pieces: [] as unknown[],
  permissions: ["manage_orders"] as string[],
  toast: { success: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: [key],
  queryFn: async () => read(),
});
const mocks = vi.hoisted(() => ({}) as Record<string, unknown>);
Object.assign(mocks, {
  revisions: {
    amendOrderLineDetails: stubs.amend,
    markOrderLineSupplierTold: stubs.told,
    toLineRevisions: (data: unknown) => (Array.isArray(data) ? data : []),
    lineRevisionQueries: { authors: () => options("authors", () => ({ u1: "Sara" })) },
  },
  orders: { ordersKeys: { all: (b: string) => ["orders", b] } },
  supplierOrders: { supplierOrderKeys: { all: (b: string) => ["supplier-orders", b] } },
  workshop: { workshopQueries: { orderPieces: () => options("pieces", () => stubs.pieces) } },
  profile: {
    useProfileOptional: () => ({
      isAdmin: false,
      hasPermission: (p: string) => stubs.permissions.includes(p),
    }),
  },
  orderNumber: { useOrderNumberFormat: () => null },
  storeProfile: { useAdminStoreProfile: () => ({ profile: { addons: [], vertical: "abayas" } }) },
  vocabulary: { useVocabulary: () => ({ vocabulary: {} }) },
  activity: { logActivity: stubs.log },
  brand: { useBrand: () => ({ id: "b1", slug: "pura" }) },
});
const both = (path: string, key: string) => {
  vi.doMock(`../src/${path}`, () => mocks[key]);
  vi.doMock(`@/${path}`, () => mocks[key]);
};
both("lib/data/orders/line-revisions", "revisions");
both("lib/data/orders", "orders");
both("lib/data/supplier-orders", "supplierOrders");
both("lib/data/supplier-orders/workshop", "workshop");
both("lib/profile-context", "profile");
both("hooks/use-order-number", "orderNumber");
both("hooks/use-store-profile", "storeProfile");
both("hooks/use-vocabulary", "vocabulary");
both("lib/activity-log", "activity");
both("lib/brand-context", "brand");
vi.doMock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.doMock("sonner", () => ({ toast: stubs.toast }));

const { OrderPieceChangesCard } =
  await import("../src/features/orders/components/OrderPieceChangesCard");
const { CustomerPiecesCard } =
  await import("../src/features/supplier-orders/components/CustomerPiecesCard");

const PASSPORT = [
  { key: "fit_passport_unit", label_ar: "وحدة القياس", label_en: "Length unit", value: "in" },
  { key: "fit_passport_abaya_length", label_ar: "الطول", label_en: "Length", value: "56" },
];
const tailored = {
  id: "l1",
  revision: 1,
  description: "Black abaya",
  quantity: 1,
  location: "custom",
  product_id: "p1",
  custom_field_values: PASSPORT,
};
const ready = { ...tailored, id: "l2", description: "Shayla", location: "main" };
const order = {
  id: "o1",
  invoice_number: 1042,
  status: "confirmed",
  payment_status: "paid",
  fulfillment_status: "SENT_TO_TAILOR",
  customer_name_snapshot: "Maryam",
  line_revisions: [] as unknown[],
};
const atTailor = (sheetRevision: number, received = 0) => ({
  orderItemId: "l1",
  itemId: "pi1",
  purpose: "make",
  quantity: 1,
  receivedQuantity: received,
  pricePending: false,
  sheetRevision,
  lineRevision: 2,
  poId: "po1",
  poNumber: "PO-0007",
  expectedAt: "2026-11-20",
  vendorId: "v1",
  vendorName: "Umm Ali",
  vendorPhone: "+97333334444",
  language: "en",
});

const wrap = (props: Partial<React.ComponentProps<typeof OrderPieceChangesCard>> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrderPieceChangesCard
        brandId="b1"
        order={order}
        items={[tailored, ready]}
        products={[]}
        storeName="Pura"
        lang="en"
        {...props}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  stubs.amend.mockClear();
  stubs.told.mockClear();
  stubs.pieces = [];
  stubs.permissions = ["manage_orders"];
  vi.mocked(window.open).mockReset();
});

describe("changing a piece's measurements", () => {
  it("offers it for the made-to-order piece only, and sends only what changed with its note", async () => {
    wrap();
    expect(screen.queryByText("Shayla")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Change measurements/ }));
    const dialog = await screen.findByRole("dialog");
    const length = within(dialog).getByLabelText("Length");
    expect((length as HTMLInputElement).value).toBe("56");
    // The unit is bookkeeping: not offered.
    expect(within(dialog).queryByLabelText("Length unit")).toBeNull();
    fireEvent.change(length, { target: { value: "58" } });
    fireEvent.change(within(dialog).getByLabelText("Why it changed (optional)"), {
      target: { value: "Customer called" },
    });
    expect(within(dialog).getByText("Length: 56 → 58")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save the change" }));
    await waitFor(() => expect(stubs.amend).toHaveBeenCalledTimes(1));
    expect(stubs.amend).toHaveBeenCalledWith({
      itemId: "l1",
      values: [{ key: "fit_passport_abaya_length", value: "58" }],
      note: "Customer called",
      requestId: expect.any(String),
    });
  });

  it("waits for the order's unsaved changes, and stops once the piece is made", async () => {
    const { unmount } = wrap({ unsaved: true });
    expect(screen.getByRole("button", { name: /Change measurements/ })).toBeDisabled();
    expect(screen.getByText("Save the order's changes first.")).toBeInTheDocument();
    unmount();

    stubs.pieces = [atTailor(1, 1)];
    wrap();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Change measurements/ })).toBeDisabled(),
    );
    expect(
      screen.getByText("The piece is made: ask for an alteration instead."),
    ).toBeInTheDocument();
  });

  it("is not offered to staff who do not handle orders", () => {
    stubs.permissions = ["view_financials"];
    const { container } = wrap();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("a supplier holding the earlier sheet", () => {
  const revised = {
    ...tailored,
    revision: 2,
    custom_field_values: [{ ...PASSPORT[1], value: "58" }],
  };
  const history = [
    {
      id: "r2",
      order_item_id: "l1",
      revision: 2,
      changes: [{ key: "fit_passport_abaya_length", label_en: "Length", from: "56", to: "58" }],
      note: "Customer called",
      changed_by: "u1",
      changed_at: "2026-11-04T09:05:00Z",
      told_supplier_at: null,
    },
  ];

  it("is shown it, and the change message reaches them with nothing of the customer", async () => {
    stubs.pieces = [atTailor(1)];
    wrap({ items: [revised], order: { ...order, line_revisions: history } });
    expect(
      await screen.findByText(
        "Umm Ali has the earlier sheet (revision 1) on PO-0007: give them revision 2.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Message the supplier" }));
    const url = String(vi.mocked(window.open).mock.calls[0]?.[0]);
    expect(url.startsWith("https://wa.me/97333334444?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toContain("Pura's order PO-0007, piece: Black abaya (revision 2)");
    expect(text).toContain("• Length: 56 → 58");
    expect(text).toContain("Note: Customer called");
    expect(text).not.toContain("Maryam");
    await waitFor(() => expect(stubs.told).toHaveBeenCalledWith("l1"));
  });

  it("prints the revised sheet in the supplier's language, and records that they have it", async () => {
    const written: string[] = [];
    vi.mocked(window.open).mockImplementation(
      () =>
        ({
          document: { open: vi.fn(), write: (html: string) => written.push(html), close: vi.fn() },
        }) as unknown as Window,
    );
    stubs.pieces = [atTailor(1)];
    wrap({ items: [revised], order: { ...order, line_revisions: history }, lang: "ar" });
    fireEvent.click(await screen.findByRole("button", { name: "اطبع الورقة المعدّلة" }));
    expect(written[0]).toContain("Revision 2");
    expect(written[0]).toContain('<s class="was">56</s>');
    await waitFor(() => expect(stubs.told).toHaveBeenCalledWith("l1"));
  });

  it("lists the piece's history: which revision, who, when and what", async () => {
    wrap({ items: [revised], order: { ...order, line_revisions: history } });
    expect(screen.getByText("Change history")).toBeInTheDocument();
    expect(screen.getAllByText("Revision 2").length).toBeGreaterThan(0);
    expect(await screen.findByText(/· Sara/)).toBeInTheDocument();
    expect(screen.getByText("Length: 56 → 58")).toBeInTheDocument();
    expect(screen.getByText("Customer called")).toBeInTheDocument();
  });
});

describe("on the supplier order", () => {
  it("a customer's piece says its supplier has the earlier sheet", () => {
    const line = {
      id: "pi1",
      variant_id: null,
      product_id: "p1",
      description: "Black abaya",
      quantity: 1,
      received_quantity: 0,
      unit_cost: 20,
      line_total: 20,
      sort_order: 0,
      order_item_id: "l1",
      customer_order: { id: "o1", invoice_number: 1042 },
      purpose: "make" as const,
      sheet_revision: 1,
      line_revision: 2,
    };
    const { rerender } = render(
      <CustomerPiecesCard
        brandId="b1"
        lines={[line]}
        cost={() => "20"}
        sizeName={() => ""}
        open
        lang="en"
      />,
    );
    expect(screen.getByText(/the supplier has the earlier sheet/)).toBeInTheDocument();
    rerender(
      <CustomerPiecesCard
        brandId="b1"
        lines={[{ ...line, sheet_revision: 2 }]}
        cost={() => "20"}
        sizeName={() => ""}
        open
        lang="en"
      />,
    );
    expect(screen.queryByText(/the supplier has the earlier sheet/)).toBeNull();
  });
});
