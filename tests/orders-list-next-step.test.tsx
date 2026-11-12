import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The orders list's "next step" column (the admin audit of 2026-11-12): a delivered or cancelled
// order shows a dash there, as its status column already says so; it once repeated "Delivered"
// in both, so the orders that needed a step did not stand out.

vi.mock("../src/hooks/use-order-number", () => ({ useOrderNumber: () => (n: number) => `#${n}` }));
vi.mock("@/hooks/use-order-number", () => ({ useOrderNumber: () => (n: number) => `#${n}` }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}));

const { OrdersWorkQueue } = await import("../src/components/orders/OrdersWorkQueue");

const order = (id: string, over: Record<string, unknown>) => ({
  id,
  invoice_number: id === "a" ? 1 : 2,
  created_at: "2026-11-10T10:00:00Z",
  total: 20,
  advance_paid: 0,
  currency: "BHD",
  payment_method: "benefit",
  payment_status: "unpaid",
  status: "pending",
  fulfillment_status: "NEEDS_PACKING",
  fulfillment_method: "delivery",
  customers: { name: "Sara", phone: "39001122" },
  order_items: [],
  ...over,
});

describe("the orders list's next step", () => {
  it("is a dash for a settled order and the order's own step otherwise", () => {
    const step = vi.fn((o: { id: string }) => <button type="button">Step {o.id}</button>);
    const noop = () => undefined;
    render(
      <OrdersWorkQueue
        lang="en"
        slug="pura"
        orders={[
          order("a", {
            status: "completed",
            fulfillment_status: "DELIVERED",
            payment_status: "paid",
            advance_paid: 20,
          }),
          order("b", {}),
        ]}
        isLoading={false}
        isError={false}
        getPaymentBadge={() => null}
        getFulfillmentBadge={() => null}
        renderPrimaryAction={step}
        onCopyInvoice={noop}
        onPrintThermal={noop}
        onWhatsAppCustomer={noop}
        onQuickViewOrder={noop}
        selectedOrderIds={new Set()}
        onToggleOrder={noop}
        onToggleAll={noop}
      />,
    );
    expect(screen.getByLabelText("No next step")).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: "Step b" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Step a" })).toBeNull();
  });
});
