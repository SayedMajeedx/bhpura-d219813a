import { describe, expect, it } from "vitest";
import { composeOverviewRows, salesBySource } from "../src/lib/reporting-compose";
import {
  dailySeries,
  dashboardFigures,
  deltaPct,
} from "../src/features/dashboard/lib/dashboard-figures";
import { primaryKpisFor } from "../src/features/dashboard/lib/dashboard-kpis";

// The dashboard reads the Reports' own figures (the review of 2026-11-16): it showed 212.800 of
// "revenue" with VAT and delivery in, its store and partner parts 210.800, where Reports said
// 204.800 of sales; its average store order 25.133 where Reports said 23.800.

const pura = (scale: number) =>
  composeOverviewRows({
    overview: [
      {
        currency: "BHD",
        paid_order_value: 158.8 * scale,
        gross_merch_sales: 171 * scale,
        discounts: 28.2 * scale,
        net_merch_sales: 142.8 * scale,
        paid_order_count: 6 * scale,
        known_cogs: 79.426 * scale,
        expenses: 50 * scale,
      },
    ],
    returns: [],
    cogs: [],
    fees: [],
    incubatorSummary: [
      { currency: "BHD", gross_amount: 60 * scale, cogs: 40 * scale, sale_count: 6 },
    ],
    services: [{ currency: "BHD", service_sales: 2 * scale, service_gross: 2 * scale }],
  })[0];

describe("the dashboard's figures", () => {
  const start = new Date(2026, 9, 18);
  const figures = dashboardFigures({
    row: pura(1),
    previous: undefined,
    series: [
      {
        time_bucket: "2026-10-20T00:00:00",
        net_merch: 30,
        partner: 10,
        paid_order_count: 2,
        currency: "BHD",
      },
      {
        time_bucket: "2026-11-03T00:00:00",
        net_merch: 50,
        partner: 0,
        paid_order_count: 1,
        currency: "BHD",
      },
      { time_bucket: "2026-11-03T00:00:00", net_merch: 99, currency: "USD" },
    ],
    start,
    locale: "en-US",
    currency: "BHD",
  });

  it("are the Reports' net sales, their parts adding up, and the operating profit", () => {
    expect(figures.sales).toEqual(salesBySource(pura(1)));
    expect(figures.sales.total).toBeCloseTo(204.8, 6);
    expect(figures.sales.store + figures.sales.partners + figures.sales.services).toBeCloseTo(
      figures.sales.total,
      6,
    );
    expect(figures.netProfit).toBeCloseTo(204.8 - 119.426 - 50, 6);
  });

  it("count the store's orders and the partner shops' sales apart, and average the store's", () => {
    expect(figures).toMatchObject({ storeOrders: 6, partnerSales: 6, transactions: 12 });
    expect(figures.average).toBeCloseTo(23.8, 6);
  });

  it("draw every day of the thirty, the store's and the partners' apart, in the store's currency", () => {
    expect(figures.dailySeries).toHaveLength(30);
    const day = figures.dailySeries.find((d) => d.key === "2026-10-20")!;
    expect(day).toMatchObject({ store: 20, partner: 10, sales: 30, orders: 2 });
    expect(figures.dailySeries.find((d) => d.key === "2026-11-03")!.sales).toBe(50);
    expect(dailySeries([], start, "en-US", "BHD").every((d) => d.sales === 0)).toBe(true);
  });

  it("set each card beside the thirty days before", () => {
    const withBefore = dashboardFigures({
      row: pura(2),
      previous: pura(1),
      series: [],
      start,
      locale: "en-US",
      currency: "BHD",
    });
    expect(withBefore.salesDeltaPct).toBeCloseTo(100, 6);
    expect(withBefore.salesBefore?.total).toBeCloseTo(204.8, 6);
    expect(deltaPct(5, 0)).toBeNull();
    const [sales] = primaryKpisFor({
      isCatalog: false,
      isAr: false,
      catalogInquiries: undefined,
      figures: withBefore,
      counts: { storeOrders: 12, partnerSales: 6, transactions: 18 },
      canViewFinancials: true,
      currency: "BHD",
      locale: "en-US",
    });
    expect(sales.subValue).toMatch(/before: .*204\.800/);
    expect(sales.breakdown).toMatch(
      /Store: .*285\.600.*Partner shops: .*120\.000.*Services: .*4\.000/,
    );
  });
});
