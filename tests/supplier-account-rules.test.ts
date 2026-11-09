import { describe, expect, it } from "vitest";
import {
  accountPaymentProblem,
  methodLabel,
  owedOrders,
  paymentCredit,
  paymentsOnOrder,
  spreadPayment,
  supplierCredits,
  type AccountPayment,
} from "../src/features/supplier-orders/lib/supplier-account";
import type { SupplierOrder } from "../src/features/supplier-orders/lib/order-state";

// A supplier's account: what a payment will pay before it is recorded (as the database spreads
// it: the orders chosen, then the oldest that owe, then credit), what stops it, and what the
// recorded payments hold.

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
  created_at: "2026-11-01T08:00:00Z",
  notes: null,
  items: [],
  ...over,
});

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

// Pura's five orders with the tailor, in the order they were made.
const orders = [
  order({
    id: "a",
    po_number: "PO-0001",
    total_amount: 212,
    paid_amount: 150,
    created_at: "2026-11-03T08:00:00Z",
  }),
  order({ id: "b", po_number: "PO-0002", total_amount: 17, created_at: "2026-11-04T08:00:00Z" }),
  order({
    id: "c",
    po_number: "PO-0003",
    total_amount: 18,
    paid_amount: 10,
    created_at: "2026-11-05T08:00:00Z",
  }),
  order({
    id: "d",
    po_number: "PO-0004",
    total_amount: 43,
    paid_amount: 20,
    created_at: "2026-11-06T08:00:00Z",
  }),
  order({ id: "e", po_number: "PO-0005", total_amount: 4, created_at: "2026-11-08T08:00:00Z" }),
  order({
    id: "x",
    po_number: "PO-0006",
    total_amount: 50,
    status: "draft",
    created_at: "2026-11-08T09:00:00Z",
  }),
  order({
    id: "y",
    po_number: "PO-0007",
    total_amount: 30,
    status: "cancelled",
    created_at: "2026-11-02T08:00:00Z",
  }),
  order({
    id: "z",
    po_number: "PO-0008",
    total_amount: 99,
    vendor_id: "other",
    created_at: "2026-11-01T08:00:00Z",
  }),
];

describe("the orders a payment can pay", () => {
  it("are the supplier's that still owe, the oldest first, never a draft or a cancelled one", () => {
    expect(owedOrders(orders, "tailor")).toEqual([
      { id: "a", po_number: "PO-0001", owed: 62 },
      { id: "b", po_number: "PO-0002", owed: 17 },
      { id: "c", po_number: "PO-0003", owed: 8 },
      { id: "d", po_number: "PO-0004", owed: 23 },
      { id: "e", po_number: "PO-0005", owed: 4 },
    ]);
  });
});

describe("where a payment goes", () => {
  const owed = owedOrders(orders, "tailor");

  it("pays the oldest orders first: Pura's 114 of 9 November is one payment", () => {
    expect(spreadPayment(114, owed)).toEqual({
      lines: [
        { id: "a", po_number: "PO-0001", amount: 62, chosen: false },
        { id: "b", po_number: "PO-0002", amount: 17, chosen: false },
        { id: "c", po_number: "PO-0003", amount: 8, chosen: false },
        { id: "d", po_number: "PO-0004", amount: 23, chosen: false },
        { id: "e", po_number: "PO-0005", amount: 4, chosen: false },
      ],
      credit: 0,
    });
  });

  it("pays the orders chosen first, then the oldest, and keeps the rest as credit", () => {
    expect(spreadPayment(150, owed, { d: 23 })).toEqual({
      lines: [
        { id: "a", po_number: "PO-0001", amount: 62, chosen: false },
        { id: "b", po_number: "PO-0002", amount: 17, chosen: false },
        { id: "c", po_number: "PO-0003", amount: 8, chosen: false },
        { id: "d", po_number: "PO-0004", amount: 23, chosen: true },
        { id: "e", po_number: "PO-0005", amount: 4, chosen: false },
      ],
      credit: 36,
    });
    expect(spreadPayment(30, owed, { e: 4 }).lines).toEqual([
      { id: "a", po_number: "PO-0001", amount: 26, chosen: false },
      { id: "e", po_number: "PO-0005", amount: 4, chosen: true },
    ]);
  });

  it("is all credit when nothing is owed", () => {
    expect(spreadPayment(40, [])).toEqual({ lines: [], credit: 40 });
  });
});

describe("what stops a payment", () => {
  const owed = owedOrders(orders, "tailor");
  const ok = {
    amount: "50",
    paidOn: "2026-11-09",
    method: "cash" as const,
    chosen: {},
    owed,
    today: "2026-11-09",
  };

  it("is an amount, a day, the method and the parts chosen", () => {
    expect(accountPaymentProblem(ok)).toBeNull();
    expect(accountPaymentProblem({ ...ok, amount: "" })).toBe("amount");
    expect(accountPaymentProblem({ ...ok, amount: "0" })).toBe("amount");
    expect(accountPaymentProblem({ ...ok, amount: "1.0001" })).toBe("amount");
    expect(accountPaymentProblem({ ...ok, paidOn: "2026-11-10" })).toBe("date");
    expect(accountPaymentProblem({ ...ok, method: null })).toBe("method");
    // More than an order owes, or the parts beyond the payment.
    expect(accountPaymentProblem({ ...ok, chosen: { b: 18 } })).toBe("chosen");
    expect(accountPaymentProblem({ ...ok, chosen: { a: 40, d: 20 } })).toBe("chosen");
    expect(accountPaymentProblem({ ...ok, chosen: { x: 5 } })).toBe("chosen");
    // More than all that is owed is fine: the rest is credit.
    expect(accountPaymentProblem({ ...ok, amount: "500" })).toBeNull();
  });
});

describe("what the payments hold", () => {
  const payments = [
    payment({
      id: "p1",
      amount: 60,
      applied: [
        { po_id: "a", po_number: "PO-0001", amount: 30, voided: false },
        { po_id: "b", po_number: "PO-0002", amount: 20, voided: false },
      ],
    }),
    payment({
      id: "p2",
      amount: 25,
      voided_at: "2026-11-09T12:00:00Z",
      void_reason: "Twice",
      applied: [{ po_id: "a", po_number: "PO-0001", amount: 25, voided: true }],
    }),
    payment({ id: "p3", vendor_id: "other", amount: 5 }),
  ];

  it("is the supplier's credit: what a standing payment did not put on an order", () => {
    expect(paymentCredit(payments[0])).toBe(10);
    expect(paymentCredit(payments[1])).toBe(0);
    expect(supplierCredits(payments)).toEqual(
      new Map([
        ["tailor", 10],
        ["other", 5],
      ]),
    );
  });

  it("lists on an order what each payment put there and the other orders it paid", () => {
    const rows = paymentsOnOrder(payments, "a");
    expect(rows.map((r) => [r.payment.id, r.here, r.others])).toEqual([
      ["p1", 30, ["PO-0002"]],
      ["p2", 25, []],
    ]);
    expect(paymentsOnOrder(payments, "e")).toEqual([]);
  });

  it("names how each was paid, and says when that was not recorded", () => {
    expect(methodLabel("bank", "en")).toBe("Bank transfer");
    expect(methodLabel("benefit", "ar")).toBe("بنفت باي");
    expect(methodLabel(null, "en")).toBe("Method not recorded");
  });
});
