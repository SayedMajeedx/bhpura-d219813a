import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Clock, Plus, ReceiptText, Settings2, Truck } from "lucide-react";

// The admin on a phone, measured on a real store (2026-10-14): a page's heading card took 121
// to 167px before its first order, product or customer (the inventory's first product started
// at 755px of an 812px screen); an order's card said its stage twice and neither its date nor
// its pieces; the order filters cut their labels ("يحتاج متا…") and hid the one that showed.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...(props as object)}>{children}</a>
  ),
}));

const { orderCardWhen, orderIsSettled, orderItemsLine } =
  await import("../src/features/orders/lib/order-card");
const { AdminPageHeader, AdminPageCount, AdminPageAction } =
  await import("../src/components/admin/AdminPageHeader");
const { TeamCommandHeader } = await import("../src/components/team/TeamCommandHeader");
const { ReturnsCommandHeader } = await import("../src/components/returns/ReturnsCommandHeader");
const { OrderMobileCard } = await import("../src/components/orders/OrderMobileCard");
const { OrdersScopeSwitcher } = await import("../src/components/orders/OrdersScopeSwitcher");
const { UrgentOrdersBanner } = await import("../src/features/orders/components/UrgentOrdersBanner");
const { orderQueueTabs } = await import("../src/features/orders/lib/order-queue-tabs");

describe("what an order's card says", () => {
  it("has no next step once handed over, cancelled or refunded", () => {
    expect(orderIsSettled({ fulfillment_status: "DELIVERED" })).toBe(true);
    expect(orderIsSettled({ status: "completed", fulfillment_status: "PACKED" })).toBe(true);
    expect(orderIsSettled({ fulfillment_status: "CANCELLED" })).toBe(true);
    expect(orderIsSettled({ payment_status: "refunded", status: "refunded", total: 10 })).toBe(
      true,
    );
    expect(orderIsSettled({ fulfillment_status: "NEEDS_PACKING", payment_status: "paid" })).toBe(
      false,
    );
    expect(orderIsSettled({})).toBe(false);
  });

  it("says when it was placed on the reader's clock", () => {
    const now = new Date(2026, 9, 14, 18, 0);
    expect(orderCardWhen(new Date(2026, 9, 14, 9, 15).toISOString(), "en", now)).toMatch(/9:15/);
    expect(orderCardWhen(new Date(2026, 9, 13, 21, 5).toISOString(), "en", now)).toMatch(
      /^Yesterday 21:05/,
    );
    expect(orderCardWhen(new Date(2026, 9, 13, 21, 5).toISOString(), "ar", now)).toMatch(/^أمس/);
    expect(orderCardWhen(new Date(2026, 8, 28, 10, 0).toISOString(), "en", now)).toBe("28 Sept");
    expect(orderCardWhen(new Date(2025, 11, 30, 10, 0).toISOString(), "en", now)).toBe(
      "30 Dec 2025",
    );
    expect(orderCardWhen(null, "en", now)).toBe("");
    expect(orderCardWhen("not a date", "en", now)).toBe("");
  });

  it("names the first piece and counts the rest", () => {
    const items = [
      { description: "عباية سبيكة", name_en: "Sabika abaya", quantity: 2 },
      { description: "شيلة", quantity: 1 },
    ];
    expect(orderItemsLine(items, "ar")).toEqual({ first: "عباية سبيكة × 2", more: 1 });
    expect(orderItemsLine(items, "en")).toEqual({ first: "Sabika abaya × 2", more: 1 });
    expect(orderItemsLine([{ description: "Silk", quantity: 1 }], "en")).toEqual({
      first: "Silk",
      more: 0,
    });
    expect(orderItemsLine([], "en")).toBeNull();
    expect(orderItemsLine(null, "en")).toBeNull();
  });
});

describe("a page's heading", () => {
  it("keeps the title, its counts and the actions in one header", () => {
    render(
      <AdminPageHeader
        icon={ReceiptText}
        headingProps={{ "data-route-heading": "orders", tabIndex: -1 }}
        title="Orders"
        badges={<AdminPageCount>7 orders</AdminPageCount>}
        description="Follow payment, packing and delivery"
        actions={<button type="button">New order</button>}
      />,
    );
    const header = screen.getByRole("banner");
    const heading = screen.getByRole("heading", { level: 1, name: "Orders" });
    expect(heading).toHaveAttribute("data-route-heading", "orders");
    expect(header).toContainElement(screen.getByText("7 orders"));
    expect(header).toContainElement(screen.getByRole("button", { name: "New order" }));
    // The line saying what the page is for waits for a wider screen.
    expect(screen.getByText("Follow payment, packing and delivery")).toHaveClass("hidden");
  });
});

describe("a heading's actions on a phone", () => {
  it("give the main action a short label and keep the full one as its name", () => {
    const add = vi.fn();
    render(<AdminPageAction icon={Plus} label="Add Team Member" short="Add" onClick={add} />);
    const button = screen.getByRole("button", { name: "Add Team Member" });
    expect(screen.getByText("Add")).toHaveClass("sm:hidden");
    expect(screen.getByText("Add Team Member")).toHaveClass("hidden");
    fireEvent.click(button);
    expect(add).toHaveBeenCalledOnce();
  });

  it("show a secondary action as its icon, still named", () => {
    render(<AdminPageAction icon={Settings2} label="Return Policy" iconOnPhone />);
    expect(screen.getByRole("button", { name: "Return Policy" })).toHaveClass("w-9");
    expect(screen.getByText("Return Policy")).toHaveClass("hidden");
  });

  it("are the pages' headings: title, count and actions in one header", () => {
    const { unmount } = render(
      <TeamCommandHeader lang="ar" memberCount={4} onAddMember={() => undefined} />,
    );
    const header = screen.getByRole("banner");
    expect(
      screen.getByRole("heading", { level: 1, name: "أعضاء الفريق والصلاحيات" }),
    ).toBeInTheDocument();
    expect(header).toContainElement(screen.getByText("4 أعضاء"));
    expect(header).toContainElement(screen.getByRole("button", { name: "إضافة عضو جديد" }));
    unmount();
    render(
      <ReturnsCommandHeader
        lang="en"
        brandName="Pura"
        totalReturns={3}
        pendingReviewCount={2}
        onOpenPolicy={() => undefined}
        onNewReturn={() => undefined}
      />,
    );
    expect(screen.getByText(/2 action required/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return Policy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Return" })).toBeInTheDocument();
  });
});

describe("an order's card on a phone", () => {
  const order = (over: Record<string, unknown>) => ({
    id: "o1",
    invoice_number: 1099,
    total: 30,
    currency: "BHD",
    payment_method: "cod",
    created_at: new Date().toISOString(),
    customer_name_snapshot: "Doaa",
    customer_phone_snapshot: "97333112267",
    order_items: [
      { description: "Sabika abaya", quantity: 1 },
      { description: "Shayla", quantity: 1 },
    ],
    ...over,
  });
  const card = (o: Record<string, unknown>, action = vi.fn(() => <span>Next step</span>)) => {
    render(
      <OrderMobileCard
        lang="en"
        slug="pura"
        order={o}
        paymentBadge={{ label: "Paid", className: "" }}
        fulfillmentBadge={{ label: "Picked up", classes: "" }}
        renderPrimaryAction={action}
        selected={false}
        onSelectedChange={() => undefined}
      />,
    );
    return action;
  };

  it("says what was ordered and when, and its stage once", () => {
    const action = card(order({ fulfillment_status: "COMPLETED", status: "completed" }));
    expect(screen.getByText("Sabika abaya")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("Picked up")).toBeInTheDocument();
    // A handed-over order has no next step: no second "done" where the step would go.
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByText("Next step")).toBeNull();
  });

  it("offers the next step while there is one", () => {
    const action = card(order({ fulfillment_status: "NEEDS_PACKING", payment_status: "paid" }));
    expect(action).toHaveBeenCalled();
    expect(screen.getByText("Next step")).toBeInTheDocument();
  });
});

describe("the order filters", () => {
  const tabs = [
    { id: "follow", label_en: "Needs follow-up", label_ar: "يحتاج متابعة", count: 0, icon: Clock },
    {
      id: "payment",
      label_en: "Awaiting payment",
      label_ar: "بانتظار الدفع",
      count: 2,
      icon: Clock,
    },
    { id: "courier", label_en: "With courier", label_ar: "مع المندوب", count: 1, icon: Truck },
    { id: "done", label_en: "Completed", label_ar: "مكتملة", count: 7, icon: Truck },
  ];

  it("show every view with its whole label, the one showing pressed", () => {
    const change = vi.fn();
    render(<OrdersScopeSwitcher lang="ar" tabs={tabs} activeTab="done" onTabChange={change} />);
    for (const tab of tabs) {
      expect(screen.getByRole("button", { name: new RegExp(tab.label_ar) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /مكتملة/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /مع المندوب/ }));
    expect(change).toHaveBeenCalledWith("courier");
  });
});

describe("the orders that need action", () => {
  it("are one line that opens their tab at its first page", () => {
    const setTabFilter = vi.fn();
    const setPage = vi.fn();
    render(
      <UrgentOrdersBanner
        hasMadeToOrder={false}
        lang="ar"
        setPage={setPage}
        setTabFilter={setTabFilter}
        tabCounts={{
          all: 20,
          unpaid: 2,
          action_required: 6,
          to_prepare: 4,
          shipped: 1,
          completed: 7,
        }}
      />,
    );
    const line = screen.getByRole("button", { name: /تحتاج إجراءً فورياً: 6 طلبات/ });
    // The reasons wait for a wider screen; on a phone the line is the count and the way in.
    expect(screen.getByText(/تحصيل عند الاستلام/)).toHaveClass("hidden");
    // On a phone the first filter tab says it (amber, with its count), right above this line.
    expect(line).toHaveClass("max-sm:hidden");
    fireEvent.click(line);
    expect(setTabFilter).toHaveBeenCalledWith("action_required");
    expect(setPage).toHaveBeenCalledWith(1);
  });

  it("turn their filter tab amber while they wait, and only then", () => {
    const counts = {
      all: 20,
      unpaid: 2,
      action_required: 6,
      to_prepare: 4,
      shipped: 1,
      completed: 7,
    };
    const { rerender } = render(
      <OrdersScopeSwitcher
        lang="en"
        tabs={orderQueueTabs(counts)}
        activeTab="all"
        onTabChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Needs attention/ }).className).toMatch(/amber/);
    expect(screen.getByRole("button", { name: /Awaiting payment/ }).className).not.toMatch(/amber/);
    rerender(
      <OrdersScopeSwitcher
        lang="en"
        tabs={orderQueueTabs({ ...counts, action_required: 0 })}
        activeTab="all"
        onTabChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Needs attention/ }).className).not.toMatch(/amber/);
  });
});
