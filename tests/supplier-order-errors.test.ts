import { describe, expect, it } from "vitest";
import orders from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import payments from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import { WORDS, supplierOrderError } from "../src/features/supplier-orders/lib/errors";

// A refusal from the database reaches the merchant in words, never as "Could not save": an order
// with a payment could not be deleted, and the screen said only that it could not save.

const raised = (sql: string) =>
  [...sql.matchAll(/RAISE EXCEPTION (?:USING ERRCODE = '\d+', MESSAGE = )?'([A-Z_]+)/g)].map(
    (m) => m[1],
  );

describe("the supplier orders' refusals", () => {
  it("each have words of their own", () => {
    const codes = [...new Set([...raised(orders), ...raised(payments)])];
    expect(codes.length).toBeGreaterThan(15);
    const unworded = codes.filter((code) => !WORDS.some(([key]) => code.includes(key)));
    expect(unworded).toEqual([]);
  });

  it("say why an order with payments is not deleted, and what to do", () => {
    const error = { message: "PURCHASE_ORDER_HAS_PAYMENTS" };
    expect(supplierOrderError(error, false)).toContain("Take the payments back first");
    expect(supplierOrderError(error, true)).toContain("ألغِ الدفعات أولاً");
  });
});
