import { describe, expect, it } from "vitest";
import {
  inventoryIntelFor,
  revenueOrders,
  type DashboardOrders,
} from "../src/features/dashboard/lib/dashboard-metrics";
import { primaryKpisFor } from "../src/features/dashboard/lib/dashboard-kpis";
import { dashboardFigures } from "../src/features/dashboard/lib/dashboard-figures";
import { composeOverviewRows } from "../src/lib/reporting-compose";

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

describe("revenueOrders", () => {
  it("keeps every order that counts as sold, paid or not yet, as the Reports overview does", () => {
    const orders = [
      order({ id: "paid" }),
      order({ id: "advance", payment_status: "partially_paid", status: "in_production" }),
      order({ id: "cash-to-collect", payment_status: "pending", status: "completed" }),
      order({ id: "awaiting-transfer", payment_status: "pending", status: "pending_verification" }),
      order({ id: "cancelled", status: "Cancelled" }),
      order({ id: "archived", status: "archived_historical" }),
      order({ id: "returned", status: "returned" }),
    ] as DashboardOrders;
    expect(revenueOrders(orders).map((o) => o.id)).toEqual(["paid", "advance", "cash-to-collect"]);
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
    // The sold-out Shayla has nothing on the shelf: it is not dead stock.
    expect(intel.deadStockCount).toBe(0);
    expect(intel.lowStockCount).toBe(1);
    expect(intel.availableWithoutImages).toEqual([{ id: "p1", name: "Abaya", stock: 3 }]);
  });

  it("leaves made-to-order items and services out of every stock figure", () => {
    const service = {
      id: "s1",
      name: "Photo booth",
      name_ar: null,
      name_en: "Photo booth",
      is_active: true,
      is_made_to_order: true,
      item_kind: "service",
      image_url: null,
      media: [],
    };
    const bespoke = { ...service, id: "s2", name: "Bespoke", item_kind: "product" };
    const intel = inventoryIntelFor({
      productRows: [...products, service, bespoke] as InventoryInput["productRows"],
      variantRows: [
        ...variants,
        {
          id: "sv1",
          product_id: "s1",
          stock_main: 0,
          stock_incubator: 0,
          created_at: daysAgo(100),
        },
        {
          id: "sv2",
          product_id: "s2",
          stock_main: 0,
          stock_incubator: 0,
          created_at: daysAgo(100),
        },
      ] as InventoryInput["variantRows"],
      validRevenueOrders: orders,
      lang: "en",
      now,
    });
    // Only the two stocked products count, exactly as without them.
    expect(intel.lowStockCount).toBe(1);
    expect(intel.outOfStockVariantCount).toBe(1);
    // The sold-out Shayla has nothing on the shelf: it is not dead stock.
    expect(intel.deadStockCount).toBe(0);
    expect(intel.lowStockVariants.map((v) => v.id)).toEqual(["v2"]);
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
  const [row] = composeOverviewRows({
    overview: [
      {
        currency: "BHD",
        net_merch_sales: 150,
        gross_merch_sales: 150,
        paid_order_count: 2,
        known_cogs: 25,
        expenses: 20,
      },
    ],
    returns: [],
    cogs: [],
    fees: [],
    incubatorSummary: [],
  });
  const figures = dashboardFigures({
    row,
    previous: undefined,
    series: [],
    start: new Date(2026, 7, 27),
    locale: "en-US",
    currency: "BHD",
  });
  const base = {
    isAr: false,
    catalogInquiries: undefined,
    figures,
    counts: { storeOrders: 2, partnerSales: 0, transactions: 2 },
    currency: "BHD",
    locale: "en-US",
  };

  it("shows money cards only to people who may see financials", () => {
    expect(
      primaryKpisFor({ ...base, isCatalog: false, canViewFinancials: true }).map((k) => k.label),
    ).toEqual(["Net sales and net profit", "Average store order", "Gross margin", "Sales"]);
    expect(
      primaryKpisFor({ ...base, figures: null, isCatalog: false, canViewFinancials: false }).map(
        (k) => k.label,
      ),
    ).toEqual(["Sales"]);
  });

  it("shows inquiry cards for catalog stores", () => {
    const kpis = primaryKpisFor({ ...base, isCatalog: true, canViewFinancials: true });
    expect(kpis.map((k) => k.label)).toEqual([
      "WhatsApp Inquiries",
      "Product Views",
      "Top Inquired Product",
      "Sales recorded by hand",
    ]);
    expect(kpis[2].value).toBe("No inquiries yet");
  });
});
