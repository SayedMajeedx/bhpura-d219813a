import { describe, expect, it } from "vitest";
import { orderPaymentUpdate } from "../src/features/orders/lib/order-payment";

describe("orderPaymentUpdate", () => {
  it("writes the status, method, amount and reference", () => {
    expect(
      orderPaymentUpdate(
        {
          payment_status: "partial",
          payment_method: "benefit",
          advance_paid: 12.5,
          payment_reference: "BNF-123",
        },
        null,
      ),
    ).toEqual({
      payment_status: "partial",
      payment_method: "benefit",
      advance_paid: 12.5,
      payment_reference: "BNF-123",
    });
  });

  it("clears an empty or unspecified method", () => {
    const base = { payment_status: "unpaid" as const, advance_paid: 0 };
    expect(orderPaymentUpdate({ ...base, payment_method: "" }, null).payment_method).toBeNull();
    expect(
      orderPaymentUpdate({ ...base, payment_method: "unspecified" }, null).payment_method,
    ).toBeNull();
  });

  it("keeps the current reference when none is entered", () => {
    const input = { payment_status: "paid" as const, payment_method: "card", advance_paid: 30 };
    expect(orderPaymentUpdate(input, "SLIP-9").payment_reference).toBe("SLIP-9");
    expect(
      orderPaymentUpdate({ ...input, payment_reference: "" }, "SLIP-9").payment_reference,
    ).toBe("SLIP-9");
    // No reference at all: the key is sent as undefined, which the client drops.
    expect(orderPaymentUpdate(input, undefined).payment_reference).toBeUndefined();
  });
});
