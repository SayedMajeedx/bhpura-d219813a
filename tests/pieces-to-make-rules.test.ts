import { describe, expect, it } from "vitest";
import { daysWaiting, piecesToMake } from "../src/features/supplier-orders/lib/pieces-to-make";
import { sendBatches } from "../src/features/supplier-orders/lib/customer-pieces";
import {
  messagePieces,
  supplierMessage,
} from "../src/features/supplier-orders/lib/supplier-message";
import type { SupplierOrderLine } from "../src/features/supplier-orders/lib/order-state";

const custom = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  product_id: "p-abaya",
  variant_id: "v-52",
  description: "Black abaya · 52",
  quantity: 1,
  location: "custom",
  ...over,
});
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  invoice_number: 1000,
  created_at: "2026-10-18T09:00:00Z",
  status: "confirmed",
  payment_status: "paid",
  payment_method: "card",
  fulfillment_status: "NEEDS_PACKING",
  fulfillment_method: "delivery",
  total: 40,
  advance_paid: 40,
  customer_name_snapshot: "Fatima Ali",
  order_items: [custom(`${id}-a`)],
  ...over,
});

describe("the pieces to make", () => {
  it("are the paid made-to-order pieces waiting for the workshop, not yet with a supplier", () => {
    const groups = piecesToMake(
      [
        order("late", { created_at: "2026-10-15T09:00:00Z", invoice_number: 1001 }),
        order("sent", { fulfillment_status: "SENT_TO_TAILOR" }),
        order("unpaid", {
          payment_method: "benefit_pay",
          payment_status: "pending",
          advance_paid: 0,
        }),
        order("ready", { order_items: [custom("ready-a", { location: "main" })] }),
        order("half", {
          invoice_number: 1002,
          order_items: [custom("half-a"), custom("half-b")],
        }),
      ],
      new Set(["half-a"]),
    );
    expect(groups.map((g) => [g.orderId, g.invoice, g.lines.map((l) => l.id)])).toEqual([
      ["late", 1001, ["late-a"]],
      ["half", 1002, ["half-b"]],
    ]);
    expect(groups[0].customerName).toBe("Fatima Ali");
  });

  it("say how long each order has waited", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(daysWaiting("2026-10-18T09:00:00Z", now)).toBe(2);
    expect(daysWaiting("2026-10-20T11:00:00Z", now)).toBe(0);
  });

  it("go to one supplier order in one send, order by order", () => {
    const form = {
      vendorId: "t",
      target: "new",
      expectedAt: "2026-10-28",
      pieces: {
        "a-1": { send: true, cost: "18" },
        "a-2": { send: false, cost: "18" },
        "b-1": { send: true, cost: "20" },
      },
    };
    const groups = [
      { orderId: "a", lines: [custom("a-1"), custom("a-2")] },
      { orderId: "b", lines: [custom("b-1")] },
      { orderId: "c", lines: [custom("c-1")] },
    ];
    expect(sendBatches(form, groups)).toEqual([
      { orderId: "a", lines: [{ order_item_id: "a-1", unit_cost: 18 }] },
      { orderId: "b", lines: [{ order_item_id: "b-1", unit_cost: 20 }] },
    ]);
  });
});

describe("the message to the supplier", () => {
  const lines: SupplierOrderLine[] = [
    {
      id: "stock",
      variant_id: "v-52",
      product_id: "p-abaya",
      description: "Black abaya · 52",
      quantity: 4,
      received_quantity: 0,
      unit_cost: 18,
      line_total: 72,
      sort_order: 0,
    },
    {
      id: "cust",
      variant_id: "v-54",
      product_id: "p-abaya",
      order_item_id: "oi-9",
      description: "Black abaya · custom",
      quantity: 1,
      received_quantity: 0,
      unit_cost: 22,
      line_total: 22,
      sort_order: 1,
    },
    {
      id: "fabric",
      variant_id: null,
      product_id: null,
      description: "Crepe fabric",
      quantity: 1,
      unit_cost: 30,
      line_total: 30,
      received_quantity: 0,
      sort_order: 2,
    },
  ];
  const pieces = messagePieces(
    lines,
    {
      productName: () => "Black abaya",
      sizeName: (id) => (id === "v-52" ? "52" : "54"),
      customerPiece: () => ({
        title: "Black abaya",
        quantity: 1,
        imageUrl: null,
        options: [{ label: "Size", value: "54" }],
        details: [
          { label: "Length", value: "58" },
          { label: "Sleeve", value: "60" },
        ],
        notes: ["Wide sleeves"],
        extras: ["Silk lining"],
      }),
    },
    "en",
  );

  it("lists every piece with what makes it, and leaves the store's own costs out", () => {
    const text = supplierMessage({
      vendorName: "Umm Ali",
      storeName: "Pura Line",
      poNumber: "PO-0004",
      expectedAt: "2026-10-28",
      pieces,
      includePrices: true,
      money: (n) => `BHD ${n.toFixed(3)}`,
      lang: "en",
    });
    expect(text).toBe(
      [
        "Hello Umm Ali,",
        "Pura Line's order PO-0004, due 28/10/2026:",
        "",
        "1) Black abaya × 4",
        "Size: 52",
        "Agreed price: BHD 18.000",
        "",
        "2) Black abaya × 1",
        "Size: 54",
        "Length: 58 · Sleeve: 60",
        "Notes: Wide sleeves",
        "Extras: Silk lining",
        "Agreed price: BHD 22.000",
        "",
        "Total: BHD 94.000",
        "Thank you.",
      ].join("\n"),
    );
    expect(text).not.toContain("Crepe fabric");
  });

  it("writes no prices when the store chooses, and speaks Arabic", () => {
    const text = supplierMessage({
      vendorName: "أم علي",
      storeName: "بيورا",
      poNumber: "PO-0004",
      expectedAt: null,
      pieces,
      includePrices: false,
      money: (n) => `${n.toFixed(3)} د.ب`,
      lang: "ar",
    });
    expect(text.startsWith("السلام عليكم أم علي،\nطلبية بيورا رقم PO-0004:")).toBe(true);
    expect(text).not.toMatch(/السعر|المجموع/);
    expect(text).toContain("ملاحظات: Wide sleeves");
  });
});

describe("a made-to-order piece in a standard size", () => {
  it("is a piece for the workshop, as its job sheet already read it", async () => {
    const { detectOrderType } = await import("../src/lib/order-type-detector");
    expect(detectOrderType([{ variant_id: "v-52", location: "custom" }])).toBe("tailoring");
    expect(detectOrderType([{ variant_id: "v-52", location: "main" }])).toBe("ready_stock");
  });
});
