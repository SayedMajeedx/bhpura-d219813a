import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A piece printed for the workshop was never recorded on the supplier's order (the owner's report
// of 2026-11-04): the order's "Send to workshop" step shows only at its stage. "Put on a
// supplier order" sits beside the job sheet whatever the stage, while a workshop piece is on no
// supplier's order; the send opens on the supplier last used; and the supplier order shows each
// customer's piece with what its order says.

const stubs = vi.hoisted(() => ({
  pieces: [] as Array<{ orderItemId: string }>,
  permissions: ["manage_orders"] as string[],
  invalidateOrders: vi.fn(async () => undefined),
  sent: vi.fn(),
}));
const mocks = vi.hoisted(() => ({}) as Record<string, unknown>);
Object.assign(mocks, {
  workshop: {
    workshopQueries: {
      orderPieces: (brandId: string, orderId: string) => ({
        queryKey: ["pieces", brandId, orderId],
        queryFn: async () => stubs.pieces,
      }),
    },
  },
  orders: { invalidateOrders: stubs.invalidateOrders },
  profile: {
    useProfileOptional: () => ({
      isAdmin: false,
      hasPermission: (p: string) => stubs.permissions.includes(p),
    }),
  },
  currency: { useStoreCurrency: () => "BHD" },
  brand: { useBrandOptional: () => ({ id: "b1", slug: "pura" }) },
  dialog: {
    SendToTailorDialog: (props: {
      groups: Array<{ orderId: string; lines: Array<{ id: string }> }>;
      onSent: (poId: string | null) => Promise<void>;
    }) => (
      <div role="dialog">
        <span>Sending {props.groups[0].lines.map((l) => l.id).join(",")}</span>
        <button
          type="button"
          onClick={async () => {
            await props.onSent("po1");
            stubs.sent();
          }}
        >
          Send
        </button>
      </div>
    ),
  },
});
const both = (path: string, key: string) => {
  vi.doMock(`../src/${path}`, () => mocks[key]);
  vi.doMock(`@/${path}`, () => mocks[key]);
};
both("lib/data/supplier-orders/workshop", "workshop");
both("lib/data/orders", "orders");
both("lib/profile-context", "profile");
both("hooks/use-store-currency", "currency");
both("lib/brand-context", "brand");
both("features/supplier-orders/components/SendToTailorDialog", "dialog");
vi.doMock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

const { RecordWithSupplierButton } =
  await import("../src/features/supplier-orders/components/RecordWithSupplier");
const { rememberedSupplier, rememberSupplier } =
  await import("../src/features/supplier-orders/lib/remembered-supplier");

const tailored = {
  id: "l1",
  description: "Black abaya",
  quantity: 1,
  location: "custom",
  custom_field_values: [{ key: "fit_passport_abaya_length", label_en: "Length", value: "58" }],
};
const ready = { id: "l2", description: "Shayla", quantity: 1, location: "main" };

const wrap = (props: Partial<React.ComponentProps<typeof RecordWithSupplierButton>> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RecordWithSupplierButton
        brandId="b1"
        orderId="o1"
        lines={[tailored, ready]}
        released={false}
        title="Send to tailor"
        lang="en"
        {...props}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  stubs.pieces = [];
  stubs.permissions = ["manage_orders"];
  stubs.invalidateOrders.mockClear();
  stubs.sent.mockClear();
});

describe("putting a workshop piece on a supplier order from the order", () => {
  it("is offered while the piece is on no supplier order, and sends only the workshop piece", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Put on a supplier order" }));
    expect(screen.getByText("Sending l1,l2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(stubs.sent).toHaveBeenCalled());
    // The order is read again: its stage may have moved and its pieces are recorded.
    expect(stubs.invalidateOrders).toHaveBeenCalledWith(expect.anything(), "b1");
  });

  it("is not offered once the piece is recorded, for a cancelled order, or to other staff", async () => {
    stubs.pieces = [{ orderItemId: "l1" }];
    const { unmount } = wrap();
    // Once the order's pieces are read (the button would show by then).
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole("button", { name: "Put on a supplier order" })).toBeNull();
    unmount();

    stubs.pieces = [];
    const cancelled = wrap({ released: true });
    expect(screen.queryByRole("button", { name: "Put on a supplier order" })).toBeNull();
    cancelled.unmount();

    stubs.permissions = ["view_financials"];
    wrap();
    expect(screen.queryByRole("button", { name: "Put on a supplier order" })).toBeNull();
  });

  it("is written in Arabic for an Arabic reader", async () => {
    wrap({ lang: "ar" });
    expect(await screen.findByRole("button", { name: "سجّل في طلبية المورّد" })).toBeTruthy();
  });
});

describe("the supplier last used", () => {
  it("is remembered per store, and only while it is still a supplier", () => {
    rememberSupplier("b1", "v1");
    expect(rememberedSupplier("b1", [{ id: "v1" }, { id: "v2" }])).toBe("v1");
    expect(rememberedSupplier("b1", [{ id: "v2" }])).toBeNull();
    expect(rememberedSupplier("b2", [{ id: "v1" }])).toBeNull();
  });
});
