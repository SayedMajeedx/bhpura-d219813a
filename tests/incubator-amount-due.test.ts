import { describe, expect, it } from "vitest";
import { incubatorAmountDue } from "../src/features/incubators/lib/amount-due";

// The amount an incubator owes is the payment field's maximum: it must be exactly the amount
// shown, or the browser refuses a payment of the full balance.
describe("incubatorAmountDue", () => {
  const sale = (net_due: number, paid_amount = 0, status = "confirmed") => ({
    status,
    net_due,
    paid_amount,
  });

  it("is exact to the fils where plain addition drifts", () => {
    const sales = [sale(17.1), sale(18.2), sale(18.3)];
    expect(sales.reduce((sum, s) => sum + s.net_due, 0)).not.toBe(53.6);
    expect(incubatorAmountDue(sales)).toBe(53.6);
    expect(String(incubatorAmountDue(sales))).toBe("53.6");
  });

  it("takes off what was paid and ignores sales that are not confirmed", () => {
    expect(incubatorAmountDue([sale(10.5, 0.2), sale(99, 0, "reversed"), sale(0.1)])).toBe(10.4);
  });

  it("reads amounts the database sends as text, and is zero with no sales", () => {
    expect(
      incubatorAmountDue([{ status: "confirmed", net_due: "5.250", paid_amount: "1.125" }]),
    ).toBe(4.125);
    expect(incubatorAmountDue([])).toBe(0);
  });
});
