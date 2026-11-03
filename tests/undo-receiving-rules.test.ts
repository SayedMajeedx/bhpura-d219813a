import { describe, expect, it } from "vitest";
import {
  undoableReceipts,
  undoneMessage,
  undoStock,
} from "../src/features/supplier-orders/lib/undo-receiving";

// Undoing a supplier order's receiving (migration 20261113100000): which receipts the screen
// offers, what the store still holds of their pieces, and what the merchant reads after.

const receipt = (id: string, item_id: string, variant_id: string | null, quantity: number) => ({
  id,
  item_id,
  variant_id,
  quantity,
  undone_at: null as string | null,
});

describe("undoing receiving", () => {
  it("offers the receipts still standing, never a customer's piece", () => {
    const lines = [
      { id: "s", order_item_id: null },
      { id: "c", order_item_id: "oi1" },
    ];
    const undone = { ...receipt("r0", "s", "v-s", 1), undone_at: "2026-11-01T00:00:00Z" };
    expect(
      undoableReceipts([receipt("r1", "s", "v-s", 2), receipt("r2", "c", null, 1), undone], lines),
    ).toEqual([receipt("r1", "s", "v-s", 2)]);
  });

  it("counts what the store still holds, size by size", () => {
    const stock: Record<string, number> = { a: 5, b: 1 };
    const receipts = [
      receipt("1", "x", "a", 2),
      receipt("2", "y", "b", 2),
      receipt("3", "y", "b", 1),
    ];
    expect(undoStock(receipts, (v) => stock[v])).toEqual({ pieces: 5, held: 3, short: true });
    expect(undoStock(receipts.slice(0, 1), (v) => stock[v])).toEqual({
      pieces: 2,
      held: 2,
      short: false,
    });
  });

  it("says what happened to the stock and the cost, the count last in Arabic", () => {
    const done = { status: "ordered", repeated: false, pieces: 5, taken_out: 1, costs_kept: 1 };
    expect(undoneMessage(done, "what_is_left", "en")).toBe(
      "Receiving of 5 pieces undone. What was left of them left the stock (1 piece); the rest had gone already. A size's cost changed after it arrived, so it was kept.",
    );
    expect(undoneMessage({ ...done, costs_kept: 0 }, "leave", "ar")).toBe(
      "أُلغي الاستلام: 5 قطع. بقي المخزون كما هو.",
    );
    expect(
      undoneMessage({ ...done, pieces: 1, taken_out: 1, costs_kept: 0 }, "take_out", "en"),
    ).toBe("Receiving of 1 piece undone. It left the stock.");
  });
});
