import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { primaryKpisFor } from "../src/features/dashboard/lib/dashboard-kpis";
import { InventoryImportMenu } from "../src/features/inventory/components/InventoryImportMenu";
import { IntegrationsScopeSwitcher } from "../src/components/integrations/IntegrationsScopeSwitcher";
import { IntegrationsCommandHeader } from "../src/components/integrations/IntegrationsCommandHeader";
import {
  PENDING_ORDER_STATUSES,
  dashboardCards,
} from "../apps/boutq-os-mobile/src/lib/dashboard-cards";
import { resolveMobileModules } from "../apps/boutq-os-mobile/src/lib/store-modules";

// The rest of the services-store audit (docs/vertical-fit-audit.md): what a store that does not
// ship, keep stock or place goods with other shops is not shown, and what already holds data is.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}));

const financials = (over: Record<string, number> = {}) =>
  ({
    revenue: 1000,
    netProfit: 700,
    storeRevenue: 1000,
    incubatorRevenue: 0,
    revenueDeltaPct: 5,
    aovCurrent: 100,
    aovDeltaPct: 1,
    ordersCurrent: 10,
    ordersDeltaPct: 2,
    grossMarginPercent: 100,
    cogs: 0,
    ...over,
  }) as never;
const kpis = (isServices: boolean, over: Record<string, number> = {}) =>
  primaryKpisFor({
    isCatalog: false,
    isAr: false,
    catalogInquiries: undefined,
    financials: financials(over),
    canViewFinancials: true,
    currency: "BHD",
    locale: "en-US",
    isServices,
  });

describe("the dashboard's headline cards", () => {
  it("talk about bookings, not orders, for a services store", () => {
    const labels = kpis(true).map((k) => k.label);
    expect(labels).toContain("Average Booking Value");
    expect(labels).toContain("Total Paid Bookings");
    expect(labels.join(" ")).not.toMatch(/Order Value|Sales Transactions/);
  });

  it("leave out the gross margin of a store with no cost of goods, and keep it once a cost is recorded", () => {
    expect(kpis(true).map((k) => k.label)).not.toContain("Gross Margin %");
    expect(kpis(true, { cogs: 40, grossMarginPercent: 96 }).map((k) => k.label)).toContain(
      "Gross Margin %",
    );
  });

  it("are unchanged for a shop", () => {
    expect(kpis(false).map((k) => k.label)).toEqual([
      "Revenue & Net Profit",
      "Average Order Value (AOV)",
      "Gross Margin %",
      "Total Sales Transactions",
    ]);
  });
});

describe("the inventory import menu", () => {
  const menu = (props: { barcodes?: boolean; incubators?: boolean } = {}) =>
    render(
      <InventoryImportMenu
        slug="aurora"
        isAr={false}
        onImportInstagram={() => undefined}
        onImportCatalog={() => undefined}
        onPrintAll={() => undefined}
        onTransferSelected={() => undefined}
        {...props}
      />,
    );

  it("offers barcodes and incubator transfer to a shop", () => {
    const view = menu();
    expect(view.container.textContent).toContain("Print All Barcodes");
    expect(view.container.textContent).toContain("Transfer to Incubators");
  });

  it("leaves both out for a store with no stock and no incubators, and keeps the imports", () => {
    const view = menu({ barcodes: false, incubators: false });
    expect(view.container.textContent).not.toMatch(/Barcodes|Incubators|Advanced/);
    expect(view.container.textContent).toContain("Import Product Catalog");
    expect(view.container.textContent).toContain("Export Catalog");
  });

  it("takes the two apart", () => {
    expect(menu({ barcodes: false }).container.textContent).toContain("Transfer to Incubators");
  });
});

describe("the integrations page", () => {
  // The secondary tabs live in a "More" menu, so it is opened to look at them.
  const tabs = (shipping?: boolean, activeScope: "all" | "shipping" = "all") => {
    const view = render(
      <IntegrationsScopeSwitcher
        lang="en"
        activeScope={activeScope}
        onScopeChange={() => undefined}
        integrationCount={3}
        shipping={shipping}
      />,
    );
    const more = screen.getAllByRole("button").find((b) => /more/i.test(b.textContent ?? ""));
    if (more) fireEvent.keyDown(more, { key: "ArrowDown" });
    const text = document.body.textContent ?? "";
    view.unmount();
    return text;
  };

  it("lists the couriers tab for a store that ships", () => {
    expect(tabs()).toContain("Logistics & Shipping");
    expect(tabs(true)).toContain("Logistics & Shipping");
  });

  it("leaves it out for a store that does not, unless it is the tab already open", () => {
    expect(tabs(false)).toContain("Webhooks");
    expect(tabs(false)).not.toContain("Logistics & Shipping");
    expect(tabs(false, "shipping")).toContain("Logistics & Shipping");
  });

  it("describes what can be connected without couriers when there are none to connect", () => {
    const header = (shipping: boolean) =>
      render(
        <IntegrationsCommandHeader
          lang="en"
          brandName="Aurora"
          integrationCount={0}
          onNewIntegration={() => undefined}
          shipping={shipping}
        />,
      );
    expect(header(true).container.textContent).toContain("shipping couriers (Aramex)");
    expect(header(false).container.textContent).not.toMatch(/courier|Aramex/i);
  });
});

describe("the merchant app's dashboard cards", () => {
  const cardsFor = (vertical: string, overrides?: unknown) =>
    dashboardCards(resolveMobileModules(vertical, overrides));

  it("give a shop its orders to prepare, parcels ready and stock alerts", () => {
    expect(cardsFor("fashion")).toEqual(["pending", "ready", "lowStock"]);
  });

  it("give a services store its bookings, and no parcels or stock", () => {
    expect(cardsFor("services")).toEqual(["upcomingBookings"]);
  });

  it("follow a module the store turned on, not the vertical's name", () => {
    expect(cardsFor("services", { stock: true })).toEqual([
      "pending",
      "lowStock",
      "upcomingBookings",
    ]);
    expect(cardsFor("fashion", { shipping: false })).toEqual(["pending", "lowStock"]);
  });

  it("never count an appointment among the orders still to be done", () => {
    expect([...PENDING_ORDER_STATUSES]).toEqual([
      "draft",
      "confirmed",
      "processing",
      "in_tailoring",
      "pending",
    ]);
  });
});
