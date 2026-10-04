import { describe, expect, it } from "vitest";
import {
  advanceStage,
  orderBalance,
  owedRows,
  reminderMessage,
  summarizeAdvance,
  type AdvanceReportOrder,
} from "../src/features/advance-report/lib/advance-report";

const order = (over: Partial<AdvanceReportOrder> = {}): AdvanceReportOrder => ({
  id: "o1",
  invoice_number: 1,
  created_at: "2026-10-01T10:00:00Z",
  currency: "BHD",
  total: 100,
  advance_paid: 0,
  status: "pending",
  payment_status: "unpaid",
  customer_name_snapshot: "Mariam",
  customer_phone_snapshot: "36001234",
  public_invoice_token: "tok",
  ...over,
});

describe("where an order under an advance rule stands", () => {
  it("is awaiting when nothing is paid, balance when an advance is, settled when all is", () => {
    expect(advanceStage(order())).toBe("awaiting");
    expect(advanceStage(order({ advance_paid: 50, payment_status: "partial" }))).toBe("balance");
    expect(advanceStage(order({ advance_paid: 100, payment_status: "paid" }))).toBe("settled");
    expect(advanceStage(order({ advance_paid: 120 }))).toBe("settled");
  });

  it("leaves out orders that will never be collected or were given back", () => {
    expect(advanceStage(order({ status: "cancelled" }))).toBeNull();
    expect(advanceStage(order({ status: "draft" }))).toBeNull();
    expect(advanceStage(order({ payment_status: "refunded", advance_paid: 100 }))).toBeNull();
  });

  it("counts the balance to the fils and never below zero", () => {
    expect(orderBalance({ total: 10.001, advance_paid: 0.1 })).toBe(9.901);
    expect(orderBalance({ total: 50, advance_paid: 80 })).toBe(0);
  });
});

describe("the report's numbers", () => {
  const orders = [
    order({ id: "a", total: 100 }),
    order({ id: "b", total: 80, advance_paid: 40, payment_status: "partial" }),
    order({ id: "c", total: 60, advance_paid: 60, payment_status: "paid" }),
    order({ id: "d", total: 500, status: "cancelled" }),
    order({ id: "e", total: 70, advance_paid: 70, payment_status: "refunded" }),
  ];

  it("adds what was collected and what is owed, from the orders that count", () => {
    expect(summarizeAdvance(orders)).toEqual({
      orders: 3,
      collected: 100,
      outstanding: 140,
      awaiting: { orders: 1, amount: 100 },
      balance: { orders: 1, amount: 40 },
      settled: { orders: 1 },
      currency: "BHD",
    });
  });

  it("is empty without orders", () => {
    expect(summarizeAdvance([])).toMatchObject({ orders: 0, collected: 0, outstanding: 0 });
    expect(summarizeAdvance([]).currency).toBeNull();
  });

  it("lists who owes, the longest waiting first, with the whole days they have waited", () => {
    const rows = owedRows(
      [
        order({ id: "new", invoice_number: 9, created_at: "2026-10-03T10:00:00Z" }),
        order({
          id: "old",
          invoice_number: 4,
          created_at: "2026-09-20T10:00:00Z",
          advance_paid: 30,
        }),
        order({ id: "done", advance_paid: 100 }),
      ],
      new Date("2026-10-04T12:00:00Z"),
    );
    expect(rows.map((r) => [r.order.id, r.stage, r.balance, r.ageDays])).toEqual([
      ["old", "balance", 70, 14],
      ["new", "awaiting", 100, 1],
    ]);
  });
});

describe("the reminder a person sends", () => {
  const base = {
    brandName: "Pura",
    customerName: "Mariam",
    invoiceNumber: 12,
    balance: 45,
    currency: "BHD",
    link: "https://x.test/invoice/tok",
  };

  it("asks for the advance when nothing is paid", () => {
    const text = reminderMessage({ ...base, isAr: false, stage: "awaiting" });
    expect(text).toContain("Hello Mariam,");
    expect(text).toContain("waiting for its advance payment");
    expect(text).toContain("Amount due:");
    expect(text).toContain(base.link);
  });

  it("names the balance once an advance is paid", () => {
    const text = reminderMessage({ ...base, isAr: false, stage: "balance" });
    expect(text).toContain("the balance on order #12");
    expect(text).not.toContain("Amount due:");
  });

  it("reads in Arabic and without a name", () => {
    const text = reminderMessage({ ...base, customerName: null, isAr: true, stage: "balance" });
    expect(text.startsWith("مرحباً،")).toBe(true);
    expect(text).toContain("رقم 12");
    expect(text).toContain(base.link);
  });
});
