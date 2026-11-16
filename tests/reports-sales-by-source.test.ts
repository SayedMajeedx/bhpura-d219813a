import { describe, expect, it } from "vitest";
import { composeOverviewRows, salesBySource } from "../src/lib/reporting-compose";
import { columnsIn, growth, statementLines } from "../src/features/finance-reports/lib/statement";
import { libraryCell, type XCell } from "../src/features/finance-reports/lib/workbook";
import { salesExport } from "../src/features/report-export/lib/sales-export";
import {
  customersExport,
  productLines,
  productsExport,
} from "../src/features/report-export/lib/catalog-export";
import type { ExportContext } from "../src/features/report-export/lib/export-shared";
import { paymentMethodWords, paymentStatusWords } from "../src/lib/report-words";

// The owner's report of 2026-11-16: total sales with the partner shop did not show, and the
// Excel export listed store orders only. A period's net sales are now split by where they were
// made, the same reading on every report, and the export lists every sale under a summary whose
// figures are the overview's own.

/** A month at Pura in October 2026 shape: few store orders, a partner shop that sells more. */
const pieces = () => ({
  overview: [
    {
      currency: "BHD",
      paid_order_value: 160.8,
      gross_merch_sales: 171,
      discounts: 20.2,
      net_merch_sales: 150.8,
      shipping_collected: 10,
      vat_collected: 0,
      collected: 120,
      owed_by_customers: 40.8,
      paid_order_count: 6,
      known_cogs: 60,
      expenses: 12,
    },
  ],
  returns: [{ currency: "BHD", revenue_deduction: 10, merchandise_deduction: 10 }],
  cogs: [{ currency: "BHD", known_cogs: 60, product_cogs: 55, packaging_cogs: 5 }],
  fees: [],
  incubatorSummary: [
    {
      currency: "BHD",
      gross_amount: 133,
      cogs: 40,
      commission_amount: 0,
      sale_count: 10,
      collected: 133,
      receivables: 0,
    },
  ],
  services: [{ currency: "BHD", service_sales: 2, service_gross: 2, service_count: 1 }],
});

describe("net sales by source", () => {
  const [row] = composeOverviewRows(pieces());

  it("splits net sales into the store's orders, the partner shops and services, to the fils", () => {
    const sales = salesBySource(row);
    expect(sales).toEqual({ store: 140.8, partners: 133, services: 2, total: 275.8 });
    expect(sales.store + sales.partners + sales.services).toBeCloseTo(sales.total, 6);
    expect(row.incubator_sale_count).toBe(10);
  });

  it("reads an older row with no store figure as what the others leave", () => {
    const { store_net_sales: _gone, ...older } = row;
    expect(salesBySource(older).store).toBeCloseTo(140.8, 6);
    expect(salesBySource(undefined)).toEqual({ store: 0, partners: 0, services: 0, total: 0 });
  });

  it("gives the statement a line per source only when there is more than the store", () => {
    const keys = statementLines(columnsIn([[row]], "BHD")).map((l) => l.key);
    expect(keys).toEqual(expect.arrayContaining(["store_sales", "partner_sales", "service_sales"]));
    const [storeOnly] = composeOverviewRows({ ...pieces(), incubatorSummary: [], services: [] });
    const plain = statementLines(columnsIn([[storeOnly]], "BHD")).map((l) => l.key);
    expect(plain).not.toContain("store_sales");
  });
});

const ctx = (lang: "ar" | "en" = "en"): ExportContext => ({
  lang,
  storeName: "Pura Line",
  currency: "BHD",
  digits: 3,
  timeZone: "Asia/Bahrain",
  from: "2026-10-01",
  to: "2026-10-31",
  numberFormat: { order_number_prefix: "PL-", order_number_digits: 5 },
});

const storeSale = (n: number, at: string, subtotal: number, discount = 0) => ({
  invoice_number: n,
  created_at: at,
  customer_name: `Customer ${n}`,
  status: "completed",
  payment_status: "paid",
  payment_method: "benefit",
  currency: "BHD",
  subtotal,
  discount,
  shipping: 0,
  tax: 0,
  total: subtotal - discount,
  collected: subtotal - discount,
  owed: 0,
});

const partnerSale = (at: string, gross: number, paid: number) => ({
  sold_at: at,
  partner: "دار لولوة",
  currency: "BHD",
  product: "Ghusn",
  sku: "GH-54",
  quantity: 1,
  unit_price: gross,
  gross,
  commission: 0,
  net_due: gross,
  paid,
  cost: 10,
});

const values = (cells: XCell[]) => cells.map((c) => (c ? c.value : null));

describe("the sales export", () => {
  const [row] = composeOverviewRows(pieces());
  const file = salesExport({
    ctx: ctx(),
    overview: [row],
    sales: [
      storeSale(1042, "2026-10-03T09:00:00Z", 100.8, 10),
      storeSale(1043, "2026-10-01T09:00:00Z", 70.2, 10.2),
    ],
    partnerSales: [partnerSale("2026-10-02T09:00:00Z", 133, 100)],
    returns: [
      {
        processed_at: "2026-10-20T09:00:00Z",
        return_number: "R-1",
        invoice_number: 1042,
        currency: "BHD",
        items: 10,
        refunded: 10,
      },
    ],
    allOrders: [
      {
        invoice_number: 1050,
        created_at: "2026-10-09T09:00:00Z",
        status: "cancelled",
        total: 5,
        currency: "BHD",
        counts_as_sold: false,
      },
      {
        invoice_number: 1042,
        created_at: "2026-10-03T09:00:00Z",
        status: "completed",
        total: 90.8,
        currency: "BHD",
        counts_as_sold: true,
      },
    ],
  });
  const sheet = (name: string) => file.sheets.find((s) => s.name === name)!;
  const [summary, sales, returns, notCounted] = ["Summary", "Sales", "Returns", "Not counted"].map(
    sheet,
  );
  const line = (label: string) => summary.rows.find((r) => r[0]?.value === label);

  it("lists store orders and partner shop sales together, by day, under one total", () => {
    expect(file.sheets.map((s) => s.name)).toEqual([
      "Summary",
      "Sales",
      "Partner shops",
      "Returns",
      "Not counted",
    ]);
    const headings = sales.rows.findIndex((r) => r[0]?.value === "Date");
    const body = sales.rows.slice(headings + 1);
    expect(body.map((r) => r[1]?.value ?? r[0]?.value)).toEqual([
      "Store orders",
      "دار لولوة",
      "Store orders",
      "Total",
    ]);
    expect(body[0][2]).toMatchObject({ value: "PL-01043", text: true });
    expect(body[1][6]?.value).toBe("Part paid");
    // Net sales: 60 + 133 + 90.8 = 283.8, the summary's before returns.
    const total = body[body.length - 1];
    expect(total[9]).toMatchObject({ value: 283.8, total: true });
    expect(total[14]?.value).toBe(33); // what the partner shop still owes
  });

  it("writes a summary whose figures are the overview's own", () => {
    expect(line("Store orders, before returns")?.[1]?.value).toBe(150.8);
    expect(line("Returns")?.[1]?.value).toBe(-10);
    expect(line("Store orders, net")?.[1]?.value).toBe(140.8);
    expect(line("Partner shops")?.[1]?.value).toBe(133);
    expect(line("Gift card services")?.[1]?.value).toBe(2);
    expect(line("Total sales")?.[1]).toMatchObject({ value: 275.8, bold: true });
    expect(line("Partner shops")?.[2]?.value).toBeCloseTo(133 / 275.8, 6);
  });

  it("carries the profit and loss down to the operating profit, with the cost of goods in parts", () => {
    // The statement's own lines: net sales 275.8, cost 60 (store) + 40 (partner) = 100.
    expect(line("Net sales")?.[1]?.value).toBe(275.8);
    expect(line("Cost of goods")?.[1]?.value).toBe(-100);
    expect(line("Gross profit")?.[1]?.value).toBe(175.8);
    expect(line("Gross margin")?.[1]?.value).toBeCloseTo(175.8 / 275.8, 6);
    expect(line("Running costs")?.[1]?.value).toBe(-12);
    expect(line("Operating profit")?.[1]).toMatchObject({ value: 163.8, total: true });
    expect(line("Operating profit")?.[2]?.value).toBeCloseTo(163.8 / 275.8, 6);
    // The cost of goods in its parts, adding up to the statement's.
    expect(line("Pieces sold in store orders")?.[1]?.value).toBe(-55);
    expect(line("Packaging")?.[1]?.value).toBe(-5);
    expect(line("Pieces sold at partner shops")?.[1]?.value).toBe(-40);
    expect(line("Other order costs")).toBeUndefined();
    // Gross profit by source adds up to the gross profit (no commission here).
    const bySource = summary.rows.slice(
      summary.rows.findIndex((r) => r[0]?.value === "Gross profit by source"),
    );
    const profitOf = (label: string) => bySource.find((r) => r[0]?.value === label)?.[1]?.value;
    expect(profitOf("Store orders")).toBe(80.8);
    expect(profitOf("Partner shops")).toBe(93);
    expect(profitOf("Gift card services")).toBe(2);
    // With nothing to compare, the period before is left empty, and nothing needs checking.
    expect(line("Net sales")?.[3]).toBeNull();
    expect(summary.rows.some((r) => r[0]?.value === "Nothing to check")).toBe(true);
  });

  it("puts each figure beside the period before and says what would make the profit wrong", () => {
    const [before] = composeOverviewRows({
      ...pieces(),
      incubatorSummary: [{ currency: "BHD", gross_amount: 53.6, sale_count: 6 }],
    });
    const withBefore = salesExport({
      ctx: ctx(),
      overview: [{ ...row, missing_cost_item_count: 2, missing_cost_exposure: 40 }],
      previous: [before],
      sales: [],
      partnerSales: [],
      returns: [],
      allOrders: [],
    });
    const rows = withBefore.sheets[0].rows;
    const find = (label: string) => rows.find((r) => r[0]?.value === label);
    expect(find("Partner shops")?.[3]?.value).toBe(53.6);
    expect(find("Partner shops")?.[4]?.value).toBeCloseTo((133 - 53.6) / 53.6, 6);
    // A cost that rose reads as growth (the owner's file of 2026-11-16 read a rising cost "-16%").
    expect(find("Pieces sold in store orders")?.[4]?.value).toBe(0);
    expect(growth(-169.426, -145.997, true)).toBeCloseTo(0.1605, 4);
    expect(growth(-50, -100, true)).toBeCloseTo(-0.5, 6);
    // A profit keeps its sign: a loss that deepened fell.
    expect(growth(-100, -50)).toBeCloseTo(-1, 6);
    expect(growth(5, 0)).toBeNull();
    expect(find("Pieces sold with no cost recorded")?.[1]?.value).toBe(2);
    expect(find("Their sales")?.[1]?.value).toBe(40);
  });

  it("adds each partner shop, the expenses, stock and suppliers when there are any", () => {
    const partner = sheet("Partner shops");
    const total = partner.rows.find((r) => r[0]?.value === "Total")!;
    expect(values(total).slice(1)).toEqual([1, 133, 0, 133, 100, 33, -10, 123]);
    const more = salesExport({
      ctx: ctx(),
      overview: [row],
      sales: [],
      partnerSales: [],
      returns: [],
      allOrders: [],
      expenses: [
        { expense_date: "2026-10-04", category: "Rent", amount: 200, tax: 0, currency: "BHD" },
        { expense_date: "2026-10-05", category: "Ads", amount: 30, tax: 3, currency: "BHD" },
        { expense_date: "2026-10-06", category: "Ads", amount: 20, tax: 2, currency: "BHD" },
      ],
      stock: [{ product: "Ghusn", units: 4, value: 80, units_without_cost: 0 }],
      supplierPayments: [{ paid_on: "2026-10-07", supplier: "Umm Ali", amount: 90 }],
      supplierOwed: [{ supplier: "Umm Ali", owed: 45 }],
      receivables: { orders: [], partners: [] },
      today: "2026-11-16",
    });
    expect(more.sheets.map((s) => s.name)).toEqual([
      "Summary",
      "Sales",
      "Partner shops",
      "Expenses",
      "Balances today",
      "Stock at cost",
      "Suppliers",
    ]);
    const expenses = more.sheets[3].rows;
    const ads = expenses.find((r) => r[0]?.value === "Ads")!;
    expect(values(ads)).toEqual(["Ads", 2, 50, 5]);
    const owed = more.sheets[6].rows.at(-1)!;
    expect(values(owed)).toEqual(["Total", 45]);
  });

  it("keeps an order that does not count as sold apart, in no total", () => {
    expect(values(notCounted.rows[notCounted.rows.length - 1])).toEqual([
      "2026-10-09",
      "PL-01050",
      "Cancelled",
      "",
      5,
    ]);
    expect(returns.rows.some((r) => r[0]?.value === "Total")).toBe(true);
  });

  it("writes real dates, the store's decimals and Arabic words for an Arabic reader", () => {
    expect(libraryCell({ value: "2026-10-02", date: true })).toMatchObject({
      value: new Date("2026-10-02T00:00:00Z"),
      format: "yyyy-mm-dd",
    });
    const ar = salesExport({
      ctx: ctx("ar"),
      overview: [row],
      sales: [],
      partnerSales: [partnerSale("2026-10-02T09:00:00Z", 133, 133)],
      returns: [],
      allOrders: [],
    });
    expect(ar.sheets[1].rtl).toBe(true);
    expect(ar.csv[0].slice(0, 3)).toEqual(["التاريخ", "المصدر", "رقم الطلب"]);
    expect(ar.csv[1][6]).toBe("مدفوع");
    expect(paymentMethodWords("cod", "ar")).toBe("الدفع عند الاستلام");
    expect(paymentStatusWords("some_new_state", "en")).toBe("some new state");
  });
});

describe("the products and customers exports", () => {
  it("adds a size's sales in the store and at the partners, each apart", () => {
    const lines = productLines(
      [
        {
          variant_id: "v1",
          product_name: "Ghusn",
          size: "54",
          sku: "GH-54",
          currency: "BHD",
          units_sold: 2,
          net_merch_sales: 60,
          known_cogs: 20,
          current_stock: 4,
        },
      ],
      [
        {
          variant_id: "v1",
          product_name: "Ghusn",
          size: "54",
          currency: "BHD",
          units_sold: 1,
          net_merch_sales: 30,
          known_cogs: 10,
        },
        {
          variant_id: "v2",
          product_name: "Watar",
          size: "قياسي",
          currency: "BHD",
          units_sold: 3,
          net_merch_sales: 120,
          known_cogs: 30,
        },
      ],
      "BHD",
    );
    expect(
      lines.map((l) => [
        l.key,
        l.option,
        l.storePieces,
        l.partnerPieces,
        l.storeSales,
        l.partnerSales,
        l.cost,
      ]),
    ).toEqual([
      ["v2", null, 0, 3, 0, 120, 30],
      ["v1", "54", 2, 1, 60, 30, 30],
    ]);
    const file = productsExport(ctx(), [], []);
    expect(file.csv).toHaveLength(1);
  });

  it("writes each customer's orders, spend and average", () => {
    const file = customersExport(ctx(), [
      {
        customer_name: "Sara",
        currency: "BHD",
        paid_order_count: 2,
        total_spent: 50,
        last_order_at: "2026-10-05T10:00:00Z",
      },
    ]);
    expect(file.csv[1]).toEqual(["Sara", 2, 50, 25, "2026-10-05"]);
  });
});
