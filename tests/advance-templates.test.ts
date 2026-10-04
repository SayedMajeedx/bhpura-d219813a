import { describe, expect, it } from "vitest";
import {
  ADVANCE_TEMPLATES,
  currencyScale,
  templateForms,
  templatesFor,
} from "../src/features/settings/tabs/orders/advance-templates";
import { ruleDefFromForm, ruleFormError } from "../src/lib/payments/advance-rule-form";
import { advanceRulesDue } from "../src/lib/payments/advance-rules";
import { VERTICAL_DEFINITIONS } from "../src/lib/verticals/registry";

const ids = (vertical: string | null) => templatesFor(vertical).map((t) => t.id);

describe("advance-rule templates by kind of store", () => {
  it("are valid rules for every vertical and currency", () => {
    for (const template of ADVANCE_TEMPLATES) {
      for (const currency of ["BHD", "SAR", "AED", "KWD", "USD", "XXX"]) {
        for (const form of templateForms(template, currency)) {
          expect(ruleFormError(form, false), `${template.id} / ${currency}`).toBeNull();
          expect(form.name_en && form.name_ar).toBeTruthy();
        }
      }
    }
  });

  it("offer something to every vertical that ships goods, and nothing to a digital store", () => {
    for (const vertical of VERTICAL_DEFINITIONS) {
      if (vertical.id === "digital") expect(ids(vertical.id)).toEqual([]);
      else expect(ids(vertical.id).length, vertical.id).toBeGreaterThan(0);
    }
  });

  it("give a child store its parent's templates", () => {
    expect(ids("fashion")).toContain("made-to-order-deposit");
    expect(ids("abayas")).toContain("made-to-order-deposit");
    expect(ids("coffee")).toEqual(ids("food"));
    expect(ids("jewelry")).not.toContain("made-to-order-deposit");
  });

  it("treat a missing or unknown vertical as a general store", () => {
    expect(ids(null)).toEqual(ids("general"));
    expect(ids("not-a-vertical")).toContain("loyal-customers");
  });

  it("carry amounts to the store's currency, in figures a merchant would write", () => {
    const bigOrders = ADVANCE_TEMPLATES.find((t) => t.id === "big-orders")!;
    const from = (currency: string) => templateForms(bigOrders, currency)[0].min_total;
    expect(from("BHD")).toBe("50");
    expect(from("SAR")).toBe("500");
    expect(from("KWD")).toBe("40");
    expect(currencyScale("bhd")).toBe(1);
    expect(currencyScale(undefined)).toBe(1);
  });

  it("do what they say when the engine asks them", () => {
    const rules = (id: string) =>
      templateForms(
        ADVANCE_TEMPLATES.find((t) => t.id === id)!,
        "BHD",
      ).map(ruleDefFromForm);
    const lines = (amount: number, madeToOrder: boolean) => [{ amount, madeToOrder }];
    const order = (amount: number, madeToOrder = false, over = {}) => ({
      total: amount,
      shipping: 0,
      fulfillment: "delivery" as const,
      lines: lines(amount, madeToOrder),
      ...over,
    });

    expect(advanceRulesDue(order(80, true), rules("made-to-order-deposit"))).toBe(40);
    expect(advanceRulesDue(order(80, false), rules("made-to-order-deposit"))).toBeNull();
    expect(advanceRulesDue(order(49), rules("big-orders"))).toBeNull();
    expect(advanceRulesDue(order(60), rules("big-orders"))).toBe(30);
    // New customers pay 30% with the delivery fee; pickup and returning customers are not asked.
    const delivered = { total: 105, shipping: 5, lines: lines(100, false) };
    expect(advanceRulesDue(order(105, false, delivered), rules("new-buyers-delivery"))).toBe(31.5);
    expect(
      advanceRulesDue(
        order(105, false, { ...delivered, returning: true }),
        rules("new-buyers-delivery"),
      ),
    ).toBeNull();
    expect(
      advanceRulesDue(order(100, false, { fulfillment: "pickup" }), rules("new-buyers-delivery")),
    ).toBeNull();
    expect(advanceRulesDue(order(100, false, { returning: true }), rules("loyal-customers"))).toBe(
      10,
    );
  });
});
