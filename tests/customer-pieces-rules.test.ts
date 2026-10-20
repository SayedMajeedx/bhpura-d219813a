import { describe, expect, it } from "vitest";
import {
  customerOrderName,
  linesToSend,
  openOrdersOf,
  piecesBySupplierOrder,
  sendProblems,
  sendRequest,
  suggestedCost,
} from "../src/features/supplier-orders/lib/customer-pieces";
import { formFromOrder, planSave } from "../src/features/supplier-orders/lib/order-form";
import { piecesOf, type SupplierOrder } from "../src/features/supplier-orders/lib/order-state";
import { planReceive, receiveRows } from "../src/features/supplier-orders/lib/receive-plan";

const line = (over: Record<string, unknown>) => ({
  id: "l1",
  product_id: "p-abaya",
  variant_id: "v-52",
  description: "Black abaya · 52",
  quantity: 1,
  location: "custom",
  unit_cost: 15,
  ...over,
});

describe("a customer's pieces for the tailor", () => {
  it("are the order's made-to-order lines that are saved and not with a supplier yet", () => {
    const lines = [
      line({ id: "a" }),
      line({ id: "b", location: "main" }),
      line({ id: undefined }),
      line({ id: "c", location: "main", custom_field_values: [{ key: "len", value: "56" }] }),
      line({ id: "d" }),
    ];
    expect(linesToSend(lines, new Set(["d"])).map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("start at what this tailor last charged, else the product's cost, else the line's", () => {
    const productCost = (id: string) => (id === "p-abaya" ? 12 : 0);
    expect(suggestedCost(line({}), new Map([["p-abaya", 18]]), productCost)).toBe("18");
    expect(suggestedCost(line({}), new Map(), productCost)).toBe("12");
    expect(suggestedCost(line({ product_id: "p-other" }), new Map(), productCost)).toBe("15");
    expect(suggestedCost(line({ product_id: null, unit_cost: 0 }), new Map(), productCost)).toBe(
      "",
    );
  });

  it("need a tailor, a piece and each piece's cost, and ask the database what was chosen", () => {
    const form = {
      vendorId: "",
      target: "new",
      expectedAt: "2026-10-28",
      pieces: {
        a: { send: true, cost: "18" },
        b: { send: false, cost: "" },
        c: { send: true, cost: "x" },
      },
    };
    expect(sendProblems(form)).toEqual(["vendor", { cost: "c" }]);
    expect(sendProblems({ ...form, vendorId: "t", pieces: {} })).toEqual(["nothing"]);
    const ok = {
      ...form,
      vendorId: "t",
      pieces: { a: { send: true, cost: "18.5" }, b: { send: false, cost: "" } },
    };
    expect(sendRequest(ok)).toEqual({
      vendorId: "t",
      poId: null,
      expectedAt: "2026-10-28",
      lines: [{ order_item_id: "a", unit_cost: 18.5 }],
    });
    // On an open order, its own day stands.
    expect(sendRequest({ ...ok, target: "po-4" })).toMatchObject({
      poId: "po-4",
      expectedAt: null,
    });
  });

  it("join an open order of the same tailor, newest first", () => {
    const orders = [
      { id: "1", vendor_id: "t", status: "received" as const, created_at: "2026-10-01" },
      { id: "2", vendor_id: "t", status: "ordered" as const, created_at: "2026-10-05" },
      { id: "3", vendor_id: "other", status: "ordered" as const, created_at: "2026-10-09" },
      { id: "4", vendor_id: "t", status: "partially_received" as const, created_at: "2026-10-08" },
    ];
    expect(openOrdersOf(orders, "t").map((o) => o.id)).toEqual(["4", "2"]);
  });

  it("show on the customer's order which tailor has them, and never the customer's name", () => {
    const groups = piecesBySupplierOrder([
      {
        order_item_id: "a",
        quantity: 1,
        received_quantity: 1,
        unit_cost: 18,
        po_id: "po",
        po_number: "PO-0004",
        expected_at: null,
        vendor_name: "Umm Ali",
      },
      {
        order_item_id: "b",
        quantity: 2,
        received_quantity: 0,
        unit_cost: 20,
        po_id: "po",
        po_number: "PO-0004",
        expected_at: null,
        vendor_name: "Umm Ali",
      },
    ]);
    expect(groups).toEqual([
      {
        poId: "po",
        poNumber: "PO-0004",
        vendorName: "Umm Ali",
        expectedAt: null,
        pieces: 3,
        arrived: 1,
        cost: 58,
      },
    ]);
    expect(customerOrderName(1023, false)).toBe("Customer piece · order #1023");
    expect(customerOrderName(null, true)).toBe("قطعة زبون · طلب");
  });
});

describe("a customer's piece on the supplier order", () => {
  const order: SupplierOrder = {
    id: "po",
    po_number: "PO-0004",
    status: "ordered",
    vendor_id: "t",
    vendor_name: "Umm Ali",
    vendor_phone: null,
    total_amount: 58,
    paid_amount: 0,
    expected_at: null,
    received_at: null,
    created_at: "2026-10-20",
    notes: null,
    items: [
      {
        id: "stock",
        variant_id: "v-52",
        product_id: "p-abaya",
        description: "Black abaya · 52",
        quantity: 2,
        received_quantity: 0,
        unit_cost: 20,
        line_total: 40,
        sort_order: 0,
      },
      {
        id: "cust",
        variant_id: null,
        product_id: "p-abaya",
        order_item_id: "oi-9",
        customer_order: { id: "o-9", invoice_number: 1023 },
        description: "Black abaya · custom",
        quantity: 1,
        received_quantity: 0,
        unit_cost: 18,
        line_total: 18,
        sort_order: 1,
      },
    ],
  };

  it("counts as a piece, even with no size of its own", () => {
    expect(piecesOf(order)).toEqual({ ordered: 3, received: 0, remaining: 3 });
  });

  it("is its own card in the editor, and a save changes only its price", () => {
    const form = formFromOrder(order);
    expect(form.products.map((p) => [p.productId, Boolean(p.customer)])).toEqual([
      ["p-abaya", false],
      ["p-abaya", true],
    ]);
    form.products[1] = { ...form.products[1], unitCost: "19" };
    const plan = planSave(form, order.items, {
      productName: () => "Black abaya",
      sizeName: () => "52",
    });
    expect(plan.update).toEqual([
      {
        id: "cust",
        values: {
          variant_id: null,
          description: "Black abaya · custom",
          quantity: 1,
          unit_cost: 19,
          sort_order: 1,
        },
      },
    ]);
    expect(plan.insert).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("is received without touching the stock, at its cost", () => {
    const rows = receiveRows(order.items, new Map([["v-52", { onHand: 5, cost: 10 }]]));
    expect(rows.map((r) => [r.itemId, r.customer?.invoice ?? null, r.onHand])).toEqual([
      ["stock", null, 5],
      ["cust", 1023, 0],
    ]);
    const plan = planReceive(rows, { stock: "2", cust: "1" });
    expect(plan.ok && plan.preview).toEqual([
      { itemId: "stock", quantity: 2, stockAfter: 7, costAfter: 12.857 },
      { itemId: "cust", quantity: 1, stockAfter: 0, costAfter: 18 },
    ]);
  });
});
