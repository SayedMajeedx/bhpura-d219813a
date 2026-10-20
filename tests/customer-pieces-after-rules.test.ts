import { describe, expect, it } from "vitest";
import {
  backProblems,
  backRequest,
  orderPieceStates,
  piecePurpose,
  piecesAwaitingChoice,
  readyToAlter,
  releaseChoices,
  tailorPieceLines,
  type BackForm,
  type SentPiece,
} from "../src/features/supplier-orders/lib/after-sending";
import {
  messagePieces,
  supplierMessage,
} from "../src/features/supplier-orders/lib/supplier-message";
import type {
  SupplierOrder,
  SupplierOrderLine,
} from "../src/features/supplier-orders/lib/order-state";

// A customer's piece after it went to a supplier: the store's choice when the customer cancels,
// a fix (free) and an alteration (at the supplier's charge), and what the supplier is told.

const line = (over: Partial<SupplierOrderLine> = {}): SupplierOrderLine => ({
  id: "po-line",
  variant_id: "v-52",
  product_id: "p-abaya",
  order_item_id: "oi-1",
  description: "Black abaya · custom",
  quantity: 1,
  received_quantity: 0,
  unit_cost: 18,
  line_total: 18,
  sort_order: 0,
  purpose: "make",
  customer_order: { id: "o-1", invoice_number: 1001, cancelled: false },
  ...over,
});
const order = (id: string, created: string, items: SupplierOrderLine[], status = "ordered") =>
  ({
    id,
    po_number: id.toUpperCase(),
    status,
    vendor_id: "tailor",
    vendor_name: "Umm Ali",
    vendor_phone: null,
    total_amount: 0,
    paid_amount: 0,
    expected_at: null,
    received_at: null,
    created_at: created,
    notes: null,
    items,
  }) as SupplierOrder;

describe("a customer cancels after the piece was sent", () => {
  it("lets the store stop a piece before it arrives, and keep a piece with a size for sale", () => {
    expect(releaseChoices(line())).toEqual({ stop: true, stock: true });
    expect(releaseChoices(line({ received_quantity: 1 }))).toEqual({ stop: false, stock: true });
    expect(releaseChoices(line({ variant_id: null }))).toEqual({ stop: true, stock: false });
    expect(releaseChoices(line({ purpose: "fix" }))).toEqual({ stop: true, stock: false });
  });

  it("lists the cancelled customers' pieces still on open supplier orders, oldest first", () => {
    const cancelled = { id: "o-9", invoice_number: 1009, cancelled: true };
    const waiting = piecesAwaitingChoice([
      order("po-2", "2026-10-20", [line({ id: "b", customer_order: cancelled })]),
      order("po-1", "2026-10-18", [
        line({ id: "a", customer_order: cancelled }),
        line({ id: "c" }),
      ]),
      order("po-0", "2026-10-10", [line({ id: "d", customer_order: cancelled })], "cancelled"),
    ]);
    expect(waiting.map((w) => [w.order.id, w.line.id])).toEqual([
      ["po-1", "a"],
      ["po-2", "b"],
    ]);
  });
});

describe("a piece back to a supplier", () => {
  const sent = (over: Partial<SentPiece>): SentPiece => ({
    order_item_id: "oi-1",
    quantity: 1,
    received_quantity: 1,
    purpose: "make",
    work_note: null,
    po_id: "po-1",
    po_number: "PO-0001",
    vendor_id: "maker",
    vendor_name: "Umm Ali",
    ...over,
  });

  it("says where each piece is, and who made or last had it", () => {
    const lines = tailorPieceLines([
      { id: "oi-1", description: "Abaya", quantity: 1 },
      { id: "oi-2", description: "Scarf", quantity: 2 },
      { id: "oi-3", description: "Belt", quantity: null },
      { id: null, description: "unsaved" },
    ]);
    expect(lines.map((l) => [l.id, l.quantity])).toEqual([
      ["oi-1", 1],
      ["oi-2", 2],
      ["oi-3", 1],
    ]);
    const states = orderPieceStates(lines, [
      sent({}),
      sent({ order_item_id: "oi-2", received_quantity: 0, purpose: "make" }),
      sent({
        purpose: "alteration",
        received_quantity: 0,
        vendor_id: "fixer",
        vendor_name: "Atelier",
      }),
    ]);
    expect(states.map((s) => [s.line.id, s.out?.purpose ?? null, s.lastVendorId])).toEqual([
      ["oi-1", "alteration", "fixer"],
      ["oi-2", "make", "maker"],
    ]);
  });

  const form = (over: Partial<BackForm> = {}): BackForm => ({
    purpose: "fix",
    vendorId: "maker",
    target: "new",
    expectedAt: "2026-10-28",
    cost: "",
    note: "  The hem is uneven ",
    ...over,
  });

  it("is free for a fix, and costs what the supplier charges for an alteration", () => {
    expect(backRequest(form({ cost: "9" }), "oi-1")).toEqual({
      vendorId: "maker",
      poId: null,
      expectedAt: "2026-10-28",
      lines: [{ order_item_id: "oi-1", unit_cost: 0, purpose: "fix", note: "The hem is uneven" }],
    });
    expect(
      backRequest(form({ purpose: "alteration", cost: "3.5", target: "po-7" }), "oi-1"),
    ).toMatchObject({
      poId: "po-7",
      expectedAt: null,
      lines: [{ unit_cost: 3.5, purpose: "alteration" }],
    });
    expect(backRequest(form({ purpose: "alteration", cost: "" }), "oi-1").lines[0].unit_cost).toBe(
      0,
    );
  });

  it("needs a supplier and what to do; an alteration's charge is a number or nothing", () => {
    expect(backProblems(form({ vendorId: "", note: " " }))).toEqual(["vendor", "note"]);
    expect(backProblems(form({ purpose: "alteration", cost: "abc" }))).toEqual(["cost"]);
    expect(backProblems(form({ purpose: "alteration", cost: "1.2345" }))).toEqual(["cost"]);
    expect(backProblems(form({ purpose: "fix", cost: "abc" }))).toEqual([]);
  });

  it("tells the supplier what to fix or change, first", () => {
    const pieces = messagePieces(
      [line({ purpose: "fix", work_note: "The hem is uneven", unit_cost: 0, line_total: 0 })],
      { productName: () => "Black abaya", sizeName: () => "52", customerPiece: () => null },
      "en",
    );
    const text = supplierMessage({
      vendorName: "Umm Ali",
      storeName: "Pura Line",
      poNumber: "PO-0005",
      expectedAt: null,
      pieces,
      includePrices: true,
      money: (n) => `BHD ${n.toFixed(3)}`,
      lang: "en",
    });
    expect(text).toContain("1) Black abaya · custom × 1\nTo fix: The hem is uneven");
    expect(text).not.toContain("Agreed price");
  });

  it("reads anything stored but a fix or an alteration as made", () => {
    expect([
      piecePurpose("fix"),
      piecePurpose("alteration"),
      piecePurpose(null),
      piecePurpose("x"),
    ]).toEqual(["fix", "alteration", "make", "make"]);
  });
});

describe("a ready-made piece", () => {
  it("is a piece to alter; a service is not, and a piece with a supplier is not offered twice", () => {
    const lines = tailorPieceLines([
      { id: "dress", title: "Ready dress", quantity: 1, products: { item_kind: "physical" } },
      { id: "fitting", description: "Fitting", product: { item_kind: "service" } },
      { id: "abaya", description: "Black abaya · custom" },
    ]);
    expect(lines).toEqual([
      { id: "dress", description: "Ready dress", quantity: 1 },
      { id: "abaya", description: "Black abaya · custom", quantity: 1 },
    ]);
    expect(readyToAlter(lines, [{ order_item_id: "abaya" }]).map((l) => l.id)).toEqual(["dress"]);
  });
});
