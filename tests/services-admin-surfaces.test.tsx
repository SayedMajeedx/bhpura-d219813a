import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  appointmentsToCompleteCount,
  ordersNeedingAction,
  ordersToPrepareCount,
} from "../src/features/dashboard/lib/dashboard-metrics";
import { ORDER_FINANCE_SELECT } from "../src/lib/data/orders/selects";
import { orderQueueTabs } from "../src/features/orders/lib/order-queue-tabs";
import { evaluateStoreReadiness } from "../src/components/settings/StoreReadinessChecklist";

// A services store's admin: appointments are not parcels, and what it does not use (shipping,
// incubators, stock) is not on its dashboard, its orders tabs or its set-up list.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}));

const HOUR = 60 * 60 * 1000;
const appointment = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  status: "confirmed",
  // What an order is given when it is inserted, appointment or not.
  fulfillment_status: "NEEDS_PACKING",
  fulfillment_method: "appointment",
  payment_status: "paid",
  total: 100,
  bookings: [{ id: "b1", starts_at: new Date(Date.now() - HOUR).toISOString() }],
  ...over,
});
const parcel = (over: Record<string, unknown> = {}) =>
  appointment({
    id: "p1",
    fulfillment_method: "delivery",
    fulfillment_status: "NEEDS_PACKING",
    bookings: [],
    ...over,
  });

describe("the dashboard's orders under a services store", () => {
  it("asks for the way an order is fulfilled and its booking, so an appointment is not a parcel", () => {
    expect(ORDER_FINANCE_SELECT).toContain("fulfillment_method");
    expect(ORDER_FINANCE_SELECT).toContain("bookings(id, starts_at)");
  });

  it("does not count an appointment as an order to prepare", () => {
    const orders = [
      appointment(),
      appointment({ id: "a2", status: "pending", payment_status: "unpaid" }),
    ];
    expect(ordersToPrepareCount(orders as never, false)).toBe(0);
    // Without the field, the same orders read as parcels: this is what the dashboard used to show.
    const withoutMethod = orders.map(({ fulfillment_method: _m, ...rest }) => rest);
    expect(ordersToPrepareCount(withoutMethod as never, false)).toBe(1);
  });

  it("still counts a delivery order left in the store, so nothing is hidden", () => {
    expect(ordersToPrepareCount([appointment(), parcel()] as never, false)).toBe(1);
  });

  it("counts appointments whose time has come, paid or with a balance, and not the ones to come", () => {
    const due = appointment();
    const balance = appointment({ id: "a2", payment_status: "partial", advance_paid: 30 });
    const later = appointment({
      id: "a3",
      bookings: [{ id: "b3", starts_at: new Date(Date.now() + 48 * HOUR).toISOString() }],
    });
    const done = appointment({ id: "a4", status: "completed", fulfillment_status: "completed" });
    expect(appointmentsToCompleteCount([due, balance, later, done, parcel()] as never)).toBe(2);
    expect(ordersNeedingAction([due, later] as never, false).map((o) => o.id)).toEqual(["a1"]);
  });
});

describe("the orders list's tabs", () => {
  const counts = { all: 3, unpaid: 1, action_required: 1, to_prepare: 0, shipped: 0, completed: 1 };
  const ids = (tabs: ReturnType<typeof orderQueueTabs>) => tabs.map((tab) => tab.id);

  it("keep every tab for a shop", () => {
    expect(ids(orderQueueTabs(counts))).toEqual([
      "action_required",
      "unpaid",
      "to_prepare",
      "shipped",
      "completed",
      "all",
    ]);
  });

  it("leave out 'To prepare' and 'With courier' for a services store while they are empty", () => {
    expect(ids(orderQueueTabs(counts, { services: true }))).toEqual([
      "action_required",
      "unpaid",
      "completed",
      "all",
    ]);
  });

  it("keep one that still holds an order", () => {
    expect(ids(orderQueueTabs({ ...counts, to_prepare: 2 }, { services: true }))).toContain(
      "to_prepare",
    );
    expect(ids(orderQueueTabs({ ...counts, shipped: 1 }, { services: true }))).toContain("shipped");
  });
});

describe("the set-up list", () => {
  const input = {
    businessSettings: { cod_enabled: true, delivery_enabled: true },
    activeProductsCount: 3,
    logoUrl: "https://cdn.test/logo.png",
    lang: "en" as const,
  };
  const ids = (services: boolean) =>
    evaluateStoreReadiness({ ...input, services }).items.map((item) => item.id);

  it("asks a shop for shipping, and a services store for none", () => {
    expect(ids(false)).toContain("fulfillment");
    expect(ids(true)).not.toContain("fulfillment");
  });

  it("asks a services store for terms and a cancellation policy, not a return policy", () => {
    const shop = evaluateStoreReadiness({ ...input, services: false }).items.find(
      (i) => i.id === "policies",
    );
    const services = evaluateStoreReadiness({ ...input, services: true }).items.find(
      (i) => i.id === "policies",
    );
    expect(shop?.title).toBe("Publish return policy or terms page");
    expect(services?.title).toBe("Publish your terms and cancellation policy");
    expect(services?.description).not.toMatch(/refund|delivery/i);
  });

  it("counts progress over the items that are asked", () => {
    const shop = evaluateStoreReadiness({ ...input, services: false });
    const services = evaluateStoreReadiness({ ...input, services: true });
    expect(services.items.length).toBe(shop.items.length - 1);
    expect(services.totalCount).toBe(shop.totalCount - 1);
  });
});

const { DashboardCommandHeader } =
  await import("../src/components/dashboard/DashboardCommandHeader");
const { DashboardActionStrip } = await import("../src/components/dashboard/DashboardActionStrip");
const { DashboardScopeSwitcher } =
  await import("../src/components/dashboard/DashboardScopeSwitcher");

describe("the dashboard's words", () => {
  const header = (props: Record<string, unknown> = {}) =>
    render(
      <DashboardCommandHeader
        lang="en"
        slug="aurora"
        brandName="Aurora"
        salesTransactionCount={4}
        periodLabel="the last 30 days"
        {...props}
      />,
    );

  it("talk about incubators only to a store that has them", () => {
    const shop = header();
    expect(shop.container.textContent).toContain("incubator sales");
    shop.unmount();
    const noIncubators = header({ hasIncubators: false });
    expect(noIncubators.container.textContent).not.toMatch(/incubator/i);
    expect(noIncubators.container.textContent).toContain("Collected order sales");
  });

  it("talk about bookings, not parcels, to a services store", () => {
    const view = header({ isServices: true, hasIncubators: false });
    expect(view.container.textContent).toContain("4 paid bookings");
    expect(view.container.textContent).toContain("Money collected from bookings and orders");
    expect(view.container.textContent).not.toMatch(/incubator|storefront orders only/i);
  });

  const strip = (props: Record<string, unknown> = {}) =>
    render(
      <DashboardActionStrip
        slug="aurora"
        isAr={false}
        unfulfilledOrdersCount={0}
        lowStockCount={0}
        pendingReturnsCount={0}
        {...props}
      />,
    );

  it("ask a services store to complete appointments, not to fulfil and dispatch orders", () => {
    strip({ appointmentsToCompleteCount: 2 });
    expect(screen.getAllByText("Appointments to Complete").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 appointment\(s\) whose time has come/)).toBeInTheDocument();
    expect(screen.queryByText(/Fulfill Orders|waiting for dispatch/)).not.toBeInTheDocument();
  });

  it("still ask a shop to prepare its orders", () => {
    strip({ unfulfilledOrdersCount: 2 });
    expect(screen.getByText("Orders Awaiting Fulfillment")).toBeInTheDocument();
    expect(screen.queryByText("Appointments to Complete")).not.toBeInTheDocument();
  });

  it("say all is clear when nothing waits", () => {
    strip();
    expect(screen.getByText(/All queues are clear/)).toBeInTheDocument();
  });

  it("name the alerts tab for what it holds", () => {
    const view = render(
      <DashboardScopeSwitcher
        lang="en"
        activeScope="financials"
        onScopeChange={() => undefined}
        lowStockCount={0}
        tracksStock={false}
      />,
    );
    expect(view.container.textContent).toContain("Customer Alerts");
    expect(view.container.textContent).not.toContain("Stock & Customer Alerts");
    view.unmount();
    const shop = render(
      <DashboardScopeSwitcher
        lang="en"
        activeScope="financials"
        onScopeChange={() => undefined}
        lowStockCount={0}
      />,
    );
    expect(shop.container.textContent).toContain("Stock & Customer Alerts");
  });
});

const { getAdminNavItems } = await import("../src/config/admin-navigation");
const { resolveStoreModules } = await import("../src/lib/store-profile");
const { OrdersCommandHeader } = await import("../src/components/orders/OrdersCommandHeader");
const { InventoryCommandHeader } =
  await import("../src/components/inventory/InventoryCommandHeader");

describe("the admin's names for a services store's catalog and orders", () => {
  const nav = (vertical: string) =>
    getAdminNavItems({
      activeSlug: "aurora",
      isCourier: false,
      isAdmin: true,
      hasPermission: () => true,
      t: (key: string) => key,
      lang: "en",
      storeModules: resolveStoreModules({ store_vertical: vertical }),
    });

  it("call the catalog 'Services' for a services store, and keep 'Inventory' for a shop", () => {
    const services = nav("services").find((item) => item.id === "inventory");
    expect(services?.labelEn).toBe("Services");
    expect(services?.labelAr).toBe("الخدمات");
    expect(services?.descriptionEn).not.toMatch(/stock|variants/i);
    expect(nav("fashion").find((item) => item.id === "inventory")?.labelEn).toBe("Inventory");
  });

  it("leave out what a services store does not use, and keep Bookings", () => {
    const ids = nav("services").map((item) => item.id);
    expect(ids).toContain("bookings");
    expect(ids).not.toContain("incubators");
    expect(ids).not.toContain("returns");
    expect(ids).not.toContain("size-guides");
  });

  it("describe the orders list as bookings and payments, not packing and a courier", () => {
    const base = { lang: "en" as const, filteredCount: 2, isCourier: false, onCreateNew: () => {} };
    const services = render(<OrdersCommandHeader {...base} isServices />);
    expect(services.container.textContent).toContain("Follow bookings and payments");
    expect(services.container.textContent).not.toMatch(/packing|courier/i);
    services.unmount();
    const shop = render(<OrdersCommandHeader {...base} />);
    expect(shop.container.textContent).toMatch(/packing, or courier dispatch/);
  });

  it("title the catalog page 'Services' with its own count and button", () => {
    const base = { lang: "en" as const, productCount: 6, isCourier: false, onCreateNew: () => {} };
    const services = render(<InventoryCommandHeader {...base} isServices />);
    expect(services.container.textContent).toContain("Services");
    expect(services.container.textContent).toContain("6 services");
    expect(services.container.textContent).toContain("Add Service");
    expect(services.container.textContent).not.toMatch(/stock|barcode|Inventory/);
    services.unmount();
    const shop = render(<InventoryCommandHeader {...base} />);
    expect(shop.container.textContent).toContain("Inventory & Products");
    expect(shop.container.textContent).toContain("Add Product");
  });
});
