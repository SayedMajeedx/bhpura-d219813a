import { describe, expect, it } from "vitest";
import {
  averageCost,
  landedUnitCosts,
  roundCost,
} from "../src/features/supplier-orders/lib/landed-cost";
import {
  isLate,
  ordersInTab,
  ordersSummary,
  paymentOf,
  piecesOf,
  sortOrders,
  type SupplierOrder,
  type SupplierOrderLine,
} from "../src/features/supplier-orders/lib/order-state";
import {
  formFigures,
  formFromOrder,
  formProblems,
  planSave,
  type SupplierOrderForm,
} from "../src/features/supplier-orders/lib/order-form";
import {
  allRemaining,
  planReceive,
  receiveRows,
} from "../src/features/supplier-orders/lib/receive-plan";
import { supplierOrderError } from "../src/features/supplier-orders/lib/errors";

const line = (over: Partial<SupplierOrderLine>): SupplierOrderLine => ({
  id: "l1",
  variant_id: "v-s",
  product_id: "p-abaya",
  description: "Abaya · S",
  quantity: 4,
  received_quantity: 0,
  unit_cost: 18,
  line_total: 72,
  sort_order: 0,
  ...over,
});

const order = (over: Partial<SupplierOrder> = {}): SupplierOrder => ({
  id: "po1",
  po_number: "PO-0001",
  status: "ordered",
  vendor_id: "tailor",
  vendor_name: "Umm Ali",
  vendor_phone: null,
  total_amount: 210,
  paid_amount: 50,
  expected_at: null,
  received_at: null,
  created_at: "2026-10-10T08:00:00Z",
  notes: null,
  items: [
    line({ id: "s", variant_id: "v-s", quantity: 4, line_total: 72, sort_order: 0 }),
    line({ id: "m", variant_id: "v-m", quantity: 6, line_total: 108, sort_order: 1 }),
    line({
      id: "fabric",
      variant_id: null,
      product_id: null,
      description: "Crepe fabric",
      quantity: 1,
      unit_cost: 30,
      line_total: 30,
      sort_order: 2,
    }),
  ],
  ...over,
});

describe("a piece's cost", () => {
  it("takes its share of the order's other costs by its own cost", () => {
    const costs = landedUnitCosts([
      { id: "cheap", isPiece: true, quantity: 10, unitCost: 10 },
      { id: "dear", isPiece: true, quantity: 5, unitCost: 40 },
      { id: "fabric", isPiece: false, quantity: 1, unitCost: 60 },
    ]);
    // 60 over 300 of pieces: a fifth more on each.
    expect(costs).toEqual(
      new Map([
        ["cheap", 12],
        ["dear", 48],
      ]),
    );
  });

  it("averages with what is on the shelf, or starts from the new cost", () => {
    expect(averageCost({ onHand: 10, costBefore: 15, received: 5, unitCost: 24 })).toBe(18);
    expect(averageCost({ onHand: 0, costBefore: 15, received: 5, unitCost: 24 })).toBe(24);
    expect(averageCost({ onHand: 8, costBefore: 0, received: 2, unitCost: 21 })).toBe(21);
    expect(averageCost({ onHand: 2, costBefore: 10, received: 1, unitCost: 11 })).toBe(10.333);
    expect(roundCost(1.0005)).toBe(1.001);
  });
});

describe("an order's state", () => {
  it("counts pieces, not its other costs, and what is still owed", () => {
    const o = order({
      items: order().items.map((l) => (l.id === "s" ? { ...l, received_quantity: 4 } : l)),
    });
    expect(piecesOf(o)).toEqual({ ordered: 10, received: 4, remaining: 6 });
    expect(paymentOf(o)).toEqual({ total: 210, paid: 50, owed: 160, credit: 0, state: "part" });
    expect(paymentOf(order({ paid_amount: 210 })).state).toBe("paid");
    expect(paymentOf(order({ status: "cancelled" })).owed).toBe(0);
  });

  it("is late after the promised day, until it has arrived", () => {
    expect(isLate(order({ expected_at: "2026-10-18" }), "2026-10-19")).toBe(true);
    expect(isLate(order({ expected_at: "2026-10-19" }), "2026-10-19")).toBe(false);
    expect(isLate(order({ expected_at: "2026-10-01", status: "received" }), "2026-10-19")).toBe(
      false,
    );
  });

  it("lists what is late first, then by the promised day, then the rest", () => {
    const today = "2026-10-19";
    const list = [
      order({ id: "done", status: "received", created_at: "2026-10-12T00:00:00Z" }),
      order({ id: "later", expected_at: "2026-10-30" }),
      order({ id: "late", expected_at: "2026-10-15" }),
      order({ id: "soon", expected_at: "2026-10-21" }),
      order({ id: "draft", status: "draft" }),
    ];
    expect(sortOrders(list, today).map((o) => o.id)).toEqual([
      "late",
      "soon",
      "later",
      "draft",
      "done",
    ]);
    expect(ordersInTab(list, "open").map((o) => o.id)).toEqual(["later", "late", "soon", "draft"]);
    expect(ordersSummary(list, today)).toEqual({ open: 3, late: 1, awaited: 30, owed: 640 });
  });
});

describe("the editor", () => {
  const names = {
    productName: (id: string) => (id === "p-abaya" ? "Abaya" : id),
    sizeName: (id: string) => id.replace("v-", "").toUpperCase(),
  };

  it("reads a saved order as products with their sizes, and costs", () => {
    const form = formFromOrder(order());
    expect(form.products).toHaveLength(1);
    expect(form.products[0]).toMatchObject({ productId: "p-abaya", unitCost: "18" });
    expect(Object.keys(form.products[0].sizes)).toEqual(["v-s", "v-m"]);
    expect(form.costs).toMatchObject([{ description: "Crepe fabric", amount: "30" }]);
    expect(formFigures(form)).toMatchObject({ pieces: 10, total: 210, extras: 30 });
    expect(formFigures(form).perPiece.get(form.products[0].key)).toBe(21);
  });

  it("asks for a supplier and at least one piece, and keeps what arrived", () => {
    const blank: SupplierOrderForm = {
      vendorId: "",
      expectedAt: "",
      notes: "",
      products: [],
      costs: [],
    };
    expect(formProblems(blank).map((p) => p.field)).toEqual(["vendor", "pieces"]);

    const form = formFromOrder(
      order({
        items: order().items.map((l) => (l.id === "s" ? { ...l, received_quantity: 3 } : l)),
      }),
    );
    form.products[0].sizes["v-s"].quantity = "2";
    expect(formProblems(form)).toEqual([
      { field: "quantity", key: form.products[0].key, variantId: "v-s", min: 3 },
    ]);
    form.products[0].sizes["v-s"].quantity = "3";
    form.products[0].sizes["v-m"].quantity = "1.5";
    expect(formProblems(form).map((p) => p.field)).toEqual(["quantity"]);
  });

  it("adds, changes and removes only the lines that changed", () => {
    const saved = order();
    const form = formFromOrder(saved);
    form.products[0].sizes["v-m"].quantity = "8";
    form.products[0].sizes["v-l"] = { quantity: "2", received: 0 };
    form.products[0].sizes["v-s"].quantity = "";
    form.costs[0].amount = "";
    form.costs[0].description = "";
    const plan = planSave(form, saved.items, names);
    expect(plan.update).toEqual([
      {
        id: "m",
        values: {
          variant_id: "v-m",
          description: "Abaya · M",
          quantity: 8,
          unit_cost: 18,
          sort_order: 0,
        },
      },
    ]);
    expect(plan.insert).toEqual([
      { variant_id: "v-l", description: "Abaya · L", quantity: 2, unit_cost: 18, sort_order: 1 },
    ]);
    expect(plan.remove.sort()).toEqual(["fabric", "s"]);
  });

  it("never removes a line that has received pieces", () => {
    const saved = order({
      items: order().items.map((l) => (l.id === "s" ? { ...l, received_quantity: 1 } : l)),
    });
    const form = formFromOrder(saved);
    form.products = [];
    expect(planSave(form, saved.items, names).remove).not.toContain("s");
  });
});

describe("receiving", () => {
  const shelf = new Map([
    ["v-s", { onHand: 10, cost: 15 }],
    ["v-m", { onHand: 0, cost: 0 }],
  ]);

  it("opens on all that is still to come, with the stock and cost after", () => {
    const o = order({
      items: order().items.map((l) => (l.id === "s" ? { ...l, received_quantity: 1 } : l)),
    });
    const rows = receiveRows(o.items, shelf);
    expect(rows.map((r) => [r.itemId, r.remaining, r.unitCost])).toEqual([
      ["s", 3, 21],
      ["m", 6, 21],
    ]);
    const typed = allRemaining(rows);
    expect(typed).toEqual({ s: "3", m: "6" });
    const plan = planReceive(rows, typed);
    expect(plan).toEqual({
      ok: true,
      lines: [
        { item_id: "s", quantity: 3 },
        { item_id: "m", quantity: 6 },
      ],
      preview: [
        // (10 x 15 + 3 x 21) / 13
        { itemId: "s", quantity: 3, stockAfter: 13, costAfter: 16.385 },
        { itemId: "m", quantity: 6, stockAfter: 6, costAfter: 21 },
      ],
    });
  });

  it("sends nothing it would refuse", () => {
    const rows = receiveRows(order().items, shelf);
    expect(planReceive(rows, { s: "", m: "0" })).toEqual({ ok: false, problem: "nothing" });
    expect(planReceive(rows, { s: "5" })).toEqual({ ok: false, problem: "too_many", itemId: "s" });
    expect(planReceive(rows, { s: "1.5" })).toEqual({ ok: false, problem: "amount", itemId: "s" });
    expect(planReceive(rows, { s: "2" })).toMatchObject({ ok: true, lines: [{ item_id: "s" }] });
  });
});

describe("a refusal", () => {
  it("is told in the reader's language, never as a code", () => {
    const error = { message: "RECEIVE_MORE_THAN_ORDERED:abc" };
    expect(supplierOrderError(error, true)).toContain("أكثر من المتبقي");
    expect(supplierOrderError(error, false)).toContain("More pieces");
    expect(supplierOrderError({ message: "something odd" }, false)).toBe(
      "Could not save. Please try again.",
    );
  });
});
