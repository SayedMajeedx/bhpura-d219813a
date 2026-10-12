import { describe, expect, it } from "vitest";
import { localDateKey, presetRange } from "../src/features/expenses/lib/date-range";
import {
  cogsCsv,
  cogsCsvFileName,
  expenseCategories,
  filterExpenses,
  scanFailureMessage,
} from "../src/features/expenses/lib/expense-list";
import {
  costOfGoods,
  manualOpexOf,
  netProfitOf,
  paymentProcessingFeesOf,
  totalRevenueOf,
} from "../src/features/expenses/lib/profit-and-loss";

// The expenses page's rules, moved out of the page as they were: the period a preset covers,
// what the list shows, the cost-of-goods download, and the profit and loss strip.

describe("the period a preset covers", () => {
  // Wednesday 14 October 2026, on the reader's own clock.
  const now = new Date(2026, 9, 14, 15, 30);

  it("is the reader's own day, written as a day", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(presetRange("today", now)).toEqual({ from: "2026-10-14", to: "2026-10-14" });
  });

  it("is Monday to Sunday for a week, also when today is Sunday", () => {
    expect(presetRange("week", now)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(presetRange("week", new Date(2026, 9, 18, 9))).toEqual({
      from: "2026-10-12",
      to: "2026-10-18",
    });
  });

  it("is the whole month, whatever its length", () => {
    expect(presetRange("month", now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("month", new Date(2028, 1, 10))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });
});

describe("what the list shows", () => {
  const expenses = [
    { category: "Rent", expense_date: "2026-10-01", description: "Shop rent", store_name: null },
    { category: "rent ", expense_date: "2026-10-15T08:00:00Z", description: "Storage" },
    { category: "Packaging", expense_date: "2026-09-30", notes: "Gift boxes", store_name: "Boxly" },
    { category: "", expense_date: "2026-10-20", description: null },
  ];

  it("lists each category once, in the first spelling it was given", () => {
    expect(expenseCategories(expenses, "en-US")).toEqual(["Packaging", "Rent"]);
  });

  it("keeps the expenses dated inside the period, both ends included", () => {
    const shown = filterExpenses(expenses, {
      from: "2026-10-01",
      to: "2026-10-15",
      search: "",
      category: "all",
    });
    expect(shown.map((expense) => expense.expense_date)).toEqual([
      "2026-10-01",
      "2026-10-15T08:00:00Z",
    ]);
  });

  it("leaves an empty bound open", () => {
    const open = { from: "", to: "", search: "", category: "all" };
    expect(filterExpenses(expenses, open)).toHaveLength(4);
    expect(filterExpenses(expenses, { ...open, to: "2026-09-30" })).toHaveLength(1);
  });

  it("searches the description, the store, the notes and the category, in any case", () => {
    const search = (text: string) =>
      filterExpenses(expenses, { from: "", to: "", search: text, category: "all" }).length;
    expect(search("SHOP")).toBe(1);
    expect(search("boxly")).toBe(1);
    expect(search("gift")).toBe(1);
    expect(search("rent")).toBe(2);
    expect(search("nothing like it")).toBe(0);
  });

  it("matches a chosen category exactly as it is written", () => {
    const of = (category: string) =>
      filterExpenses(expenses, { from: "", to: "", search: "", category }).length;
    expect(of("Rent")).toBe(1);
    expect(of("Packaging")).toBe(1);
  });
});

describe("the cost-of-goods download", () => {
  const orders = [
    {
      created_at: "2026-10-05T10:00:00Z",
      invoice_number: 1042,
      order_items: [
        { description: 'Abaya "Noor"', quantity: 2, unit_cost: 12.5 },
        { description: null, quantity: 1 },
      ],
    },
    { created_at: "2026-10-06T10:00:00Z", invoice_number: 1043, order_items: null },
  ];

  it("has a line per order line, quotes a name, and ends with the total", () => {
    const lines = cogsCsv(orders, "en", "en-US").split("\n");
    expect(lines[0]).toBe("Date,Order #,Product,Qty,Unit Cost,Total Cost");
    expect(lines[1]).toBe('10/5/2026,#1042,"Abaya ""Noor""",2,12.500,25.000');
    expect(lines[2]).toBe('10/5/2026,#1042,"",1,0.000,0.000');
    expect(lines.slice(3)).toEqual(["", ",,,,Total,25.000"]);
  });

  it("is headed in Arabic for an Arabic reader", () => {
    const lines = cogsCsv([], "ar", "ar-BH-u-nu-latn").split("\n");
    expect(lines[0]).toBe("التاريخ,رقم الطلب,المنتج,الكمية,تكلفة الوحدة,إجمالي التكلفة");
    expect(lines[2]).toBe(",,,,الإجمالي,0.000");
  });

  it("is named after its period", () => {
    expect(cogsCsvFileName({ from: "2026-10-01", to: "2026-10-31" })).toBe(
      "cogs_2026-10-01_2026-10-31.csv",
    );
    expect(cogsCsvFileName({ from: "", to: "" })).toBe("cogs_start_end.csv");
  });
});

describe("a receipt that could not be scanned", () => {
  it("is explained in the reader's language", () => {
    expect(scanFailureMessage("RATE_LIMITED", "en")).toBe("Rate limited, try again");
    expect(scanFailureMessage("PDF_TOO_LARGE", "en")).toBe("PDF is too large (max 2.5MB)");
    expect(scanFailureMessage("IMAGE_TOO_LARGE", "en")).toBe(
      scanFailureMessage("IMAGE_PROCESSING_FAILED", "en"),
    );
    expect(scanFailureMessage("GEMINI_MODEL_UNAVAILABLE", "ar")).toBe(
      "نموذج الذكاء الاصطناعي غير متاح حالياً",
    );
  });

  it("passes on a message it does not know, and has words when there is none", () => {
    expect(scanFailureMessage("Something else", "en")).toBe("Something else");
    expect(scanFailureMessage(undefined, "en")).toBe("Failed to scan receipt");
    expect(scanFailureMessage(undefined, "ar")).toBe("فشل مسح الفاتورة");
  });
});

describe("the profit and loss strip", () => {
  const noCatalog = { products: [], variants: [], bomItems: [], materials: [] };
  const orders = [
    {
      total: 100,
      payment_method: "card",
      fulfillment_status: "DELIVERED",
      order_items: [
        { quantity: 2, unit_cost: 10, packaging_cost_snapshot: 0.5 },
        { quantity: 1, unit_cost: 5, packaging_cost_snapshot: 0.25 },
      ],
    },
    {
      total: 50,
      payment_method: "benefit",
      fulfillment_status: "NEEDS_PACKING",
      status: "confirmed",
      order_items: [{ quantity: 1, unit_cost: 20, packaging_cost_snapshot: 0.5 }],
    },
    { total: "30", payment_method: "cod", order_items: null },
  ];

  it("adds up what the period's orders brought in", () => {
    expect(totalRevenueOf(orders)).toBe(180);
    expect(totalRevenueOf([])).toBe(0);
  });

  it("counts every sold line's cost, and packaging only for orders that have left", () => {
    expect(costOfGoods(orders, noCatalog, true)).toEqual({
      productCogs: 45,
      packagingBomCogs: 1.25,
      totalCogs: 46.25,
    });
  });

  it("counts no packaging for a store that does not use its bill of materials", () => {
    expect(costOfGoods(orders, noCatalog, false)).toEqual({
      productCogs: 45,
      packagingBomCogs: 0,
      totalCogs: 45,
    });
  });

  it("takes the store's own percentage of card and BenefitPay orders as fees", () => {
    expect(paymentProcessingFeesOf(orders, 2.5, 1)).toBeCloseTo(3);
    expect(paymentProcessingFeesOf(orders, 0, 0)).toBe(0);
  });

  it("counts as running costs every expense that is not a stock purchase", () => {
    expect(
      manualOpexOf([
        { expense_type: "opex", amount: 40 },
        { expense_type: null, amount: "10" },
        { expense_type: "cogs", amount: 500 },
        { amount: 5 },
      ]),
    ).toBe(55);
  });

  it("works out net profit and its margin, and no margin when nothing was sold", () => {
    expect(
      netProfitOf({ totalRevenue: 180, totalCogs: 46.25, manualOpex: 55, processingFees: 3 }),
    ).toEqual({ totalOpex: 58, netProfit: 75.75, marginPercentage: (75.75 / 180) * 100 });
    expect(
      netProfitOf({ totalRevenue: 0, totalCogs: 0, manualOpex: 20, processingFees: 0 }),
    ).toEqual({ totalOpex: 20, netProfit: -20, marginPercentage: 0 });
  });
});
