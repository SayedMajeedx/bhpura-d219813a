import { describe, expect, it } from "vitest";
import {
  customerSegments,
  dashboardFinancials,
  inventoryIntelFor,
  paidRevenueOrders,
  type DashboardOrders,
} from "../src/features/dashboard/lib/dashboard-metrics";
import { primaryKpisFor } from "../src/features/dashboard/lib/dashboard-kpis";

type FinancialsInput = Parameters<typeof dashboardFinancials>[0];

const now = new Date(2026, 8, 25, 12, 0, 0);
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "o",
  created_at: daysAgo(1),
  total: 100,
  status: "delivered",
  fulfillment_status: "delivered",
  payment_status: "paid",
  payment_method: "cod",
  customer_id: "c1",
  order_items: [],
  ...overrides,
});

describe("paidRevenueOrders", () => {
  it("keeps paid orders that were not cancelled, refunded or archived", () => {
    const orders = [
      order({ id: "paid" }),
      order({ id: "unpaid", payment_status: "pending" }),
      order({ id: "cancelled", status: "Cancelled" }),
      order({ id: "archived", status: "archived_historical" }),
      order({ id: "refunded", fulfillment_status: "refunded" }),
    ] as DashboardOrders;
    expect(paidRevenueOrders(orders).map((o) => o.id)).toEqual(["paid"]);
  });
});

const financialsInput = (overrides: Partial<FinancialsInput> = {}): FinancialsInput => ({
  validRevenueOrders: [
    order({
      id: "a",
      total: 100,
      payment_method: "card",
      order_items: [{ variant_id: "v1", quantity: 2, unit_cost: null }],
    }),
    order({
      id: "b",
      total: 50,
      payment_method: "benefit",
      order_items: [{ variant_id: "v1", quantity: 1, unit_cost: 5 }],
    }),
    order({ id: "prior", total: 60, created_at: daysAgo(40) }),
  ] as DashboardOrders,
  expenseRows: [
    { amount: 20, expense_type: "opex", expense_date: daysAgo(2) },
    { amount: 99, expense_type: "cogs", expense_date: daysAgo(2) },
    { amount: 7, expense_type: "opex", expense_date: daysAgo(90) },
  ] as FinancialsInput["expenseRows"],
  incubatorSaleRows: [],
  variantRows: [{ id: "v1", cost_price: 10 }] as FinancialsInput["variantRows"],
  productRows: [],
  bomItemRows: [],
  packagingMaterialRows: [],
  settings: {
    business_name: "",
    currency: "BHD",
    card_processing_fee: 2,
    benefit_processing_fee: 1,
    bom_enabled: false,
    storefront_mode: "shop",
  },
  accountingRow: undefined,
  previousAccountingRow: undefined,
  locale: "en-US",
  now,
  ...overrides,
});

describe("dashboardFinancials", () => {
  it("falls back to order sums when Reports has no row", () => {
    const f = dashboardFinancials(financialsInput());
    expect(f.revenue).toBe(150);
    expect(f.storeRevenue).toBe(150);
    // 2 x variant cost 10, then 1 x the line's own unit cost 5.
    expect(f.cogs).toBe(25);
    // Opex expenses only, plus 2% of the card order and 1% of the Benefit order.
    expect(f.opex).toBeCloseTo(20 + 2 + 0.5);
    expect(f.netProfit).toBeCloseTo(150 - 25 - 22.5);
    expect(f.ordersCurrent).toBe(2);
    expect(f.aovCurrent).toBe(75);
    expect(f.revenueDeltaPct).toBeCloseTo(150);
    expect(f.dailyChartSeries).toHaveLength(30);
    expect(f.dailyChartSeries.reduce((sum, day) => sum + day.sales, 0)).toBe(150);
  });

  it("uses the Reports accounting row so both screens agree", () => {
    const f = dashboardFinancials(
      financialsInput({
        accountingRow: {
          net_revenue: 500,
          net_merchandise_after_returns: 400,
          known_cogs_after_returns: 100,
          expenses: 50,
        },
        previousAccountingRow: { net_revenue: 250 },
      }),
    );
    expect(f.revenue).toBe(500);
    expect(f.cogs).toBe(100);
    expect(f.opex).toBe(50);
    expect(f.netProfit).toBe(250);
    expect(f.grossMarginPercent).toBe(75);
    expect(f.revenueDeltaPct).toBe(100);
  });
});

describe("customerSegments", () => {
  it("counts VIPs and customers idle for 60 days", () => {
    const orders = [
      order({ customer_id: "vip", total: 300, created_at: daysAgo(90) }),
      order({ customer_id: "recent", total: 40, created_at: daysAgo(3) }),
      order({ customer_id: "idle", total: 40, created_at: daysAgo(70) }),
    ] as DashboardOrders;
    const customers = [
      { id: "vip", name: "Vip", phone: null },
      { id: "recent", name: "Recent", phone: null },
      { id: "idle", name: "Idle", phone: null },
      { id: "new", name: "No orders", phone: null },
    ] as Parameters<typeof customerSegments>[1];
    expect(customerSegments(orders, customers, now)).toEqual({
      vipCount: 1,
      churnRiskCount: 2,
      churnRiskVips: [{ id: "vip", name: "Vip" }],
    });
  });
});

describe("inventoryIntelFor", () => {
  type InventoryInput = Parameters<typeof inventoryIntelFor>[0];
  const products = [
    {
      id: "p1",
      name: "Abaya",
      name_ar: "عباية",
      name_en: "Abaya",
      is_active: true,
      image_url: null,
      media: [],
    },
    {
      id: "p2",
      name: "Shayla",
      name_ar: null,
      name_en: "Shayla",
      is_active: true,
      image_url: "x.jpg",
      media: [],
    },
  ] as InventoryInput["productRows"];
  const variants = [
    {
      id: "v1",
      product_id: "p1",
      size: "52",
      color: "Black",
      stock_main: 3,
      stock_incubator: 0,
      created_at: daysAgo(100),
    },
    {
      id: "v2",
      product_id: "p2",
      size: null,
      color: null,
      stock_main: 0,
      stock_incubator: 0,
      created_at: daysAgo(100),
    },
  ] as InventoryInput["variantRows"];
  const orders = [
    order({ created_at: daysAgo(5), order_items: [{ variant_id: "v1", quantity: 9 }] }),
  ] as DashboardOrders;

  it("flags fast sellers, sold-out variants, dead stock and missing images", () => {
    const intel = inventoryIntelFor({
      productRows: products,
      variantRows: variants,
      validRevenueOrders: orders,
      lang: "en",
      now,
    });
    // 9 sold in 45 days: 0.2 a day, so 3 left last 15 days (over 14) and is not listed.
    expect(intel.lowStockVariants).toEqual([{ id: "v2", name: "Shayla", stock: 0, daysLeft: 0 }]);
    expect(intel.outOfStockVariantCount).toBe(1);
    expect(intel.deadStockCount).toBe(1);
    expect(intel.lowStockCount).toBe(1);
    expect(intel.availableWithoutImages).toEqual([{ id: "p1", name: "Abaya", stock: 3 }]);
  });

  it("lists a variant running out within two weeks, named in the shopper's language", () => {
    const busy = [
      order({ created_at: daysAgo(5), order_items: [{ variant_id: "v1", quantity: 45 }] }),
    ] as DashboardOrders;
    const intel = inventoryIntelFor({
      productRows: products,
      variantRows: variants,
      validRevenueOrders: busy,
      lang: "ar",
      now,
    });
    expect(intel.lowStockVariants[1]).toEqual({
      id: "v1",
      name: "عباية (52) - Black",
      stock: 3,
      daysLeft: 3,
    });
  });
});

describe("primaryKpisFor", () => {
  const financials = dashboardFinancials(financialsInput());
  const base = {
    isAr: false,
    catalogInquiries: undefined,
    financials,
    currency: "BHD",
    locale: "en-US",
  };

  it("shows money cards only to people who may see financials", () => {
    expect(
      primaryKpisFor({ ...base, isCatalog: false, canViewFinancials: true }).map((k) => k.label),
    ).toEqual([
      "Revenue & Net Profit",
      "Average Order Value (AOV)",
      "Gross Margin %",
      "Total Sales Transactions",
    ]);
    expect(
      primaryKpisFor({ ...base, isCatalog: false, canViewFinancials: false }).map((k) => k.label),
    ).toEqual(["Total Sales Transactions"]);
  });

  it("shows inquiry cards for catalog stores", () => {
    const kpis = primaryKpisFor({ ...base, isCatalog: true, canViewFinancials: true });
    expect(kpis.map((k) => k.label)).toEqual([
      "WhatsApp Inquiries",
      "Product Views",
      "Top Inquired Product",
      "Manual Sales Recorded",
    ]);
    expect(kpis[2].value).toBe("No inquiries yet");
  });
});
