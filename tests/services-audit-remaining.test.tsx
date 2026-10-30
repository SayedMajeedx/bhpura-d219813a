import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { primaryKpisFor } from "../src/features/dashboard/lib/dashboard-kpis";
import { InventoryImportMenu } from "../src/features/inventory/components/InventoryImportMenu";
import { IntegrationsScopeSwitcher } from "../src/components/integrations/IntegrationsScopeSwitcher";
import { PROVIDER_PRESETS, shownIntegration } from "../src/lib/integration-providers";
import { IntegrationsCommandHeader } from "../src/components/integrations/IntegrationsCommandHeader";

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
    expect(view.container.textContent).toContain("Transfer to partner shops");
  });

  it("leaves both out for a store with no stock and no incubators, and keeps the imports", () => {
    const view = menu({ barcodes: false, incubators: false });
    expect(view.container.textContent).not.toMatch(/Barcodes|Incubators|Advanced/);
    expect(view.container.textContent).toContain("Import Product Catalog");
    expect(view.container.textContent).toContain("Export Catalog");
  });

  it("takes the two apart", () => {
    expect(menu({ barcodes: false }).container.textContent).toContain("Transfer to partner shops");
  });
});

describe("the integrations page", () => {
  // The secondary tabs live in a "More" menu, so it is opened to look at them.
  const tabs = () => {
    const view = render(
      <IntegrationsScopeSwitcher
        lang="en"
        activeScope="all"
        onScopeChange={() => undefined}
        integrationCount={3}
      />,
    );
    const more = screen.getAllByRole("button").find((b) => /more/i.test(b.textContent ?? ""));
    if (more) fireEvent.keyDown(more, { key: "ArrowDown" });
    const text = document.body.textContent ?? "";
    view.unmount();
    return text;
  };

  it("offers no couriers tab: no courier is connected through the platform yet", () => {
    expect(tabs()).toContain("Webhooks");
    expect(tabs()).not.toContain("Logistics & Shipping");
  });

  it("names only what the platform really connects", () => {
    const { container } = render(
      <IntegrationsCommandHeader
        lang="en"
        integrationCount={0}
        onNewIntegration={() => undefined}
      />,
    );
    expect(container.textContent).toContain("Tap");
    expect(container.textContent).not.toMatch(/courier|Aramex|Stripe/i);
  });

  it("hides the integrations nothing uses, and any row already saved for them", () => {
    expect(PROVIDER_PRESETS.map((p) => p.value)).not.toEqual(expect.arrayContaining(["aramex"]));
    for (const hidden of ["aramex", "posta_plus", "stripe"]) {
      expect(PROVIDER_PRESETS.some((p) => p.value === hidden)).toBe(false);
      expect(shownIntegration({ provider: hidden })).toBe(false);
    }
    expect(shownIntegration({ provider: "tap" })).toBe(true);
    expect(shownIntegration({ provider: "my-erp" })).toBe(true);
  });
});
