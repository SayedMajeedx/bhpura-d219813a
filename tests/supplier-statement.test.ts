import { describe, expect, it } from "vitest";
import {
  balanceWords,
  buildSupplierStatement,
  rangeText,
  statementMessage,
  statementRange,
} from "../src/features/supplier-orders/lib/supplier-statement";
import {
  statementHtml,
  statementSheet,
} from "../src/features/supplier-orders/lib/supplier-statement-files";
import type { SupplierOrder } from "../src/features/supplier-orders/lib/order-state";
import type { AccountPayment } from "../src/features/supplier-orders/lib/supplier-account";

// A supplier's statement of account: the balance before a period, each order and payment in it
// with the balance after, and the balance at its end; drawn as an Excel sheet, an A4 page and a
// WhatsApp summary. Orders count from the day they were made, payments on the day they were paid.

const order = (over: Partial<SupplierOrder>): SupplierOrder => ({
  id: "po",
  po_number: "PO-0001",
  status: "ordered",
  vendor_id: "tailor",
  vendor_name: "Umm Ali",
  vendor_phone: null,
  total_amount: 0,
  paid_amount: 0,
  expected_at: null,
  received_at: null,
  created_at: "2026-11-01T08:00:00",
  notes: null,
  items: [],
  ...over,
});
const payment = (over: Partial<AccountPayment>): AccountPayment => ({
  id: "pay",
  vendor_id: "tailor",
  amount: 0,
  paid_on: "2026-11-09",
  kind: "payment",
  method: "benefit",
  reference: null,
  note: null,
  created_at: "2026-11-09T10:00:00",
  voided_at: null,
  void_reason: null,
  applied: [],
  ...over,
});

const orders = [
  order({ id: "a", po_number: "PO-0001", total_amount: 212, created_at: "2026-10-28T09:00:00" }),
  order({ id: "b", po_number: "PO-0002", total_amount: 17, created_at: "2026-11-04T09:00:00" }),
  order({ id: "c", po_number: "PO-0003", total_amount: 18, created_at: "2026-11-05T09:00:00" }),
  order({
    id: "d",
    po_number: "PO-0004",
    total_amount: 50,
    status: "cancelled",
    created_at: "2026-11-05T10:00:00",
  }),
  order({
    id: "e",
    po_number: "PO-0005",
    total_amount: 9,
    status: "draft",
    created_at: "2026-11-05T11:00:00",
  }),
  order({
    id: "f",
    po_number: "PO-0006",
    total_amount: 99,
    vendor_id: "other",
    created_at: "2026-11-05T12:00:00",
  }),
];
const payments = [
  payment({
    id: "p1",
    amount: 150,
    paid_on: "2026-10-30",
    method: "cash",
    created_at: "2026-10-30T09:00:00",
    applied: [{ po_id: "a", po_number: "PO-0001", amount: 150, voided: false }],
  }),
  payment({
    id: "p2",
    amount: 114,
    paid_on: "2026-11-09",
    reference: "BP-77",
    applied: [
      { po_id: "a", po_number: "PO-0001", amount: 62, voided: false },
      { po_id: "b", po_number: "PO-0002", amount: 17, voided: false },
      { po_id: "c", po_number: "PO-0003", amount: 18, voided: false },
    ],
  }),
  payment({ id: "p3", amount: 40, paid_on: "2026-11-02", voided_at: "x", void_reason: "Twice" }),
];
const supplier = { id: "tailor", name: "Umm Ali" };
const money = (n: number) => `BHD ${n.toFixed(3)}`;

describe("a supplier's statement", () => {
  it("opens with the balance before the period and keeps a balance after every line", () => {
    const s = buildSupplierStatement({
      supplier,
      orders,
      payments,
      range: { from: "2026-11-01", to: "2026-11-30" },
      lang: "en",
    });
    // 212 ordered in October, 150 paid: 62 owed going into November.
    expect(s.opening).toBe(62);
    expect(s.lines.map((l) => [l.date, l.title, l.ordered, l.paid, l.balance])).toEqual([
      ["2026-11-04", "Order PO-0002", 17, 0, 79],
      ["2026-11-05", "Order PO-0003", 18, 0, 97],
      ["2026-11-09", "Payment", 0, 114, -17],
    ]);
    expect(s.lines[2].detail).toBe("BenefitPay · Paid PO-0001, PO-0002, PO-0003 · BP-77");
    expect([s.ordered, s.paid, s.closing]).toEqual([35, 114, -17]);
  });

  it("over all time starts at nothing, and leaves out drafts, cancelled orders, payments taken back and other suppliers", () => {
    const s = buildSupplierStatement({
      supplier,
      orders,
      payments,
      range: statementRange("all"),
      lang: "ar",
    });
    expect(s.opening).toBe(0);
    expect(s.lines).toHaveLength(5);
    expect(s.lines.map((l) => l.title)).toEqual([
      "طلبية PO-0001",
      "دفعة",
      "طلبية PO-0002",
      "طلبية PO-0003",
      "دفعة",
    ]);
    expect(s.lines[1].detail).toBe("نقداً · دفعت PO-0001");
    expect(s.closing).toBe(-17);
  });

  it("says a balance as what is owed or the store's credit", () => {
    expect(balanceWords(62, money, "en")).toBe("You owe BHD 62.000");
    expect(balanceWords(-17, money, "ar")).toBe("لك عند المورد BHD 17.000");
    expect(balanceWords(0, money, "en")).toBe("Nothing owed");
  });

  it("names its periods on the reader's calendar", () => {
    const now = new Date(2026, 10, 9);
    expect(statementRange("this_month", now)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(statementRange("last_month", now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(statementRange("last_3_months", now)).toEqual({ from: "2026-09-01", to: "2026-11-30" });
    expect(statementRange("this_year", now)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(rangeText({ from: null, to: null }, "ar")).toBe("كل الفترات");
    expect(rangeText({ from: "2026-11-01", to: "2026-11-30" }, "en")).toBe(
      "2026-11-01 to 2026-11-30",
    );
  });
});

describe("the statement's files", () => {
  const s = buildSupplierStatement({
    supplier: { id: "tailor", name: "Umm <Ali>" },
    orders,
    payments,
    range: { from: "2026-11-01", to: "2026-11-30" },
    lang: "en",
  });

  it("is an Excel sheet of real numbers in the currency's decimals, right to left in Arabic", () => {
    const sheet = statementSheet(s, { lang: "ar", store: "Pura", digits: 3 });
    expect(sheet.rtl).toBe(true);
    const opening = sheet.rows[6];
    expect(opening[5]).toMatchObject({ value: 62, format: '#,##0.000;(#,##0.000);"–"' });
    const last = sheet.rows[9];
    expect(last.map((c) => (c ? c.value : null))).toEqual([
      "2026-11-09",
      "Payment",
      "BenefitPay · Paid PO-0001, PO-0002, PO-0003 · BP-77",
      null,
      114,
      -17,
    ]);
    const totals = sheet.rows[10];
    expect(totals.slice(3).map((c) => c?.value)).toEqual([35, 114, -17]);
  });

  it("is an A4 page that escapes what it prints and prints itself", () => {
    const html = statementHtml(s, { lang: "en", store: "Pura & Co", money, today: "9 Nov 2026" });
    expect(html).toContain("Umm &lt;Ali&gt;");
    expect(html).toContain("Pura &amp; Co");
    expect(html).toContain("Your credit BHD 17.000");
    expect(html).toContain("window.print()");
    expect(html).not.toContain("<Ali>");
  });

  it("is a WhatsApp summary a person sends to agree the account", () => {
    const message = statementMessage(s, { lang: "en", store: "Pura", money });
    expect(message.split("\n")).toEqual([
      "Hello Umm <Ali>,",
      "Here is your account with Pura (2026-11-01 to 2026-11-30):",
      "Balance before: BHD 62.000",
      "Orders: BHD 35.000",
      "Paid: BHD 114.000",
      "Balance now: BHD 17.000 in our favour",
      "Please check it against yours. Thank you.",
    ]);
  });
});

describe("adjustments on the statement", () => {
  const withDiscount = [
    ...payments,
    payment({
      id: "d1",
      amount: 5,
      paid_on: "2026-11-06",
      kind: "discount",
      method: null,
      note: "Late delivery",
      created_at: "2026-11-06T09:00:00",
      applied: [{ po_id: "c", po_number: "PO-0003", amount: 5, voided: false }],
    }),
  ];
  const s = buildSupplierStatement({
    supplier,
    orders,
    payments: withDiscount,
    range: { from: "2026-11-01", to: "2026-11-30" },
    lang: "en",
  });

  it("lowers the balance on its day in a column of its own, never as paid", () => {
    expect(s.lines.map((l) => [l.title, l.paid, l.adjusted, l.balance])).toEqual([
      ["Order PO-0002", 0, 0, 79],
      ["Order PO-0003", 0, 0, 97],
      ["Discount from the supplier", 0, 5, 92],
      ["Payment", 114, 0, -22],
    ]);
    expect(s.lines[2]).toMatchObject({ kind: "adjustment", detail: "Late delivery · On PO-0003" });
    expect([s.paid, s.adjusted, s.closing]).toEqual([114, 5, -22]);
  });

  it("gets its own column in the sheet and the page, and a line in the message", () => {
    const sheet = statementSheet(s, { lang: "en", store: "Pura", digits: 3 });
    expect(sheet.rows[5].map((c) => c?.value)).toEqual([
      "Date",
      "Entry",
      "Details",
      "Orders (owed)",
      "Paid",
      "Discount or write-off",
      "Balance",
    ]);
    expect(sheet.rows[9].map((c) => (c ? c.value : null)).slice(3)).toEqual([null, null, 5, 92]);
    expect(sheet.rows[11].slice(3).map((c) => c?.value)).toEqual([35, 114, 5, -22]);
    expect(statementHtml(s, { lang: "en", store: "Pura", money, today: "x" })).toContain(
      "<th>Discount or write-off</th>",
    );
    expect(statementMessage(s, { lang: "en", store: "Pura", money })).toContain(
      "Discounts and adjustments: BHD 5.000",
    );
  });
});
