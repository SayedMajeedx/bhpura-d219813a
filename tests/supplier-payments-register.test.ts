import { describe, expect, it } from "vitest";
import {
  registerRows,
  registerSheet,
  registerTotals,
  type RegisterFilter,
} from "../src/features/supplier-orders/lib/payments-register";
import type { AccountPayment } from "../src/features/supplier-orders/lib/supplier-account";

// Every payment to the store's suppliers in one list: chosen by period, supplier and method,
// with the period's totals by method and by supplier; a payment taken back counts in no total.

const payment = (over: Partial<AccountPayment>): AccountPayment => ({
  id: "pay",
  vendor_id: "tailor",
  amount: 0,
  paid_on: "2026-11-09",
  method: "benefit",
  reference: null,
  note: null,
  created_at: "2026-11-09T10:00:00Z",
  voided_at: null,
  void_reason: null,
  applied: [],
  ...over,
});

const payments = [
  payment({
    id: "p1",
    amount: 114,
    reference: "BP-77",
    applied: [
      { po_id: "a", po_number: "PO-0001", amount: 62, voided: false },
      { po_id: "b", po_number: "PO-0002", amount: 40, voided: false },
    ],
  }),
  payment({ id: "p2", amount: 50, paid_on: "2026-11-04", method: "cash" }),
  payment({ id: "p3", amount: 30, paid_on: "2026-11-02", vendor_id: "silk", method: "bank" }),
  payment({ id: "p4", amount: 134, paid_on: "2026-10-30", method: null, note: "Before" }),
  payment({
    id: "p5",
    amount: 20,
    paid_on: "2026-11-05",
    voided_at: "2026-11-05T12:00:00Z",
    void_reason: "Twice",
  }),
];
const names = new Map([
  ["tailor", "Umm Ali"],
  ["silk", "Silk house"],
]);
const november: RegisterFilter = {
  range: { from: "2026-11-01", to: "2026-11-30" },
  vendorId: "all",
  method: "all",
  showTakenBack: false,
};

describe("the payments register", () => {
  it("lists the period's payments, the latest first, with the orders each paid and its credit", () => {
    const rows = registerRows(payments, names, november, "Supplier");
    expect(rows.map((r) => [r.payment.id, r.supplier, r.ordersPaid, r.credit])).toEqual([
      ["p1", "Umm Ali", ["PO-0001", "PO-0002"], 12],
      ["p2", "Umm Ali", [], 50],
      ["p3", "Silk house", [], 30],
    ]);
  });

  it("chooses by supplier and by method, and shows a payment taken back only when asked", () => {
    expect(
      registerRows(payments, names, { ...november, vendorId: "silk" }, "Supplier").map(
        (r) => r.payment.id,
      ),
    ).toEqual(["p3"]);
    expect(
      registerRows(payments, names, { ...november, method: "cash" }, "Supplier").map(
        (r) => r.payment.id,
      ),
    ).toEqual(["p2"]);
    expect(
      registerRows(
        payments,
        names,
        { ...november, range: { from: null, to: null }, method: "none" },
        "Supplier",
      ).map((r) => r.payment.id),
    ).toEqual(["p4"]);
    const all = registerRows(payments, names, { ...november, showTakenBack: true }, "Supplier");
    expect(all.find((r) => r.payment.id === "p5")?.takenBack).toBe(true);
  });

  it("adds up what was paid by method and by supplier, never a payment taken back", () => {
    const rows = registerRows(payments, names, { ...november, showTakenBack: true }, "Supplier");
    expect(registerTotals(rows)).toEqual({
      total: 194,
      count: 3,
      byMethod: [
        { method: "cash", total: 50, count: 1 },
        { method: "benefit", total: 114, count: 1 },
        { method: "bank", total: 30, count: 1 },
      ],
      bySupplier: [
        { vendorId: "tailor", supplier: "Umm Ali", total: 164, count: 2 },
        { vendorId: "silk", supplier: "Silk house", total: 30, count: 1 },
      ],
    });
  });

  it("is an Excel sheet of the payments and the totals, in the currency's decimals", () => {
    const rows = registerRows(payments, names, november, "Supplier");
    const sheet = registerSheet(rows, {
      lang: "en",
      store: "Pura",
      range: november.range,
      digits: 3,
    });
    expect(sheet.rows[5].map((c) => (c ? c.value : null))).toEqual([
      "2026-11-09",
      "Umm Ali",
      "BenefitPay",
      "BP-77",
      "PO-0001, PO-0002",
      12,
      null,
      114,
    ]);
    const totalRow = sheet.rows[8];
    expect(totalRow[0]?.value).toBe("Total");
    expect(totalRow[7]).toMatchObject({ value: 194, format: '#,##0.000;(#,##0.000);"–"' });
  });
});
