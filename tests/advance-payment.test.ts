import { describe, expect, it } from "vitest";
import {
  advanceDue,
  advanceForOrder,
  advanceLines,
  advancePercentError,
  advanceRuleFrom,
  advanceScopeFrom,
  methodsUnderAdvance,
  type AdvanceOrder,
  type AdvanceRule,
} from "../src/lib/payments/advance-payment";
import type { AdvanceRuleDef } from "../src/lib/payments/advance-rules";

const money = (n: number) => `BHD ${n.toFixed(3)}`;
const rule = (over: Partial<AdvanceRule> = {}): AdvanceRule => ({
  enabled: true,
  percent: 30,
  scope: "all",
  rules: [],
  ...over,
});
const order = (over: Partial<AdvanceOrder> = {}): AdvanceOrder => ({
  total: 100,
  shipping: 0,
  fulfillment: "delivery",
  lines: [{ amount: 100, madeToOrder: false }],
  ...over,
});
const mixed = [
  { amount: 60, madeToOrder: true },
  { amount: 40, madeToOrder: false },
];

describe("a store's advance-payment rule", () => {
  it("is off unless switched on, keeps the percentage within 1 to 100, and knows its scope", () => {
    expect(advanceRuleFrom(undefined)).toEqual({
      enabled: false,
      percent: 30,
      scope: "all",
      rules: [],
    });
    expect(
      advanceRuleFrom({
        advance_payment_enabled: true,
        advance_payment_percent: 40,
        advance_payment_scope: "delivery",
      }),
    ).toEqual({ enabled: true, percent: 40, scope: "delivery", rules: [] });
    expect(
      advanceRuleFrom({ advance_payment_enabled: true, advance_payment_percent: "25.5" }).percent,
    ).toBe(25.5);
    for (const bad of [0, -5, 101, "x", null]) {
      expect(
        advanceRuleFrom({ advance_payment_enabled: true, advance_payment_percent: bad as never })
          .percent,
      ).toBe(30);
    }
    expect(advanceRuleFrom({ advance_payment_enabled: null }).enabled).toBe(false);
    expect(advanceScopeFrom("made_to_order_or_delivery")).toBe("made_to_order_or_delivery");
    expect(advanceScopeFrom("everything")).toBe("all");
    expect(advanceScopeFrom(undefined)).toBe("all");
  });

  it("asks a share of the whole order under 'all', rounded up to the fils", () => {
    expect(advanceDue(order(), rule())).toBe(30);
    expect(advanceDue(order({ total: 41.25 }), rule())).toBe(12.375);
    expect(advanceDue(order({ total: 10.001 }), rule())).toBe(3.001);
    expect(advanceDue(order({ total: 80 }), rule({ percent: 100 }))).toBe(80);
    expect(advanceDue(order(), rule({ enabled: false }))).toBeNull();
    expect(advanceDue(order({ total: 0 }), rule())).toBeNull();
  });

  it("asks only the made-to-order lines, never the delivery fee, under made_to_order", () => {
    const r = rule({ scope: "made_to_order", percent: 50 });
    expect(advanceDue(order({ lines: mixed }), r)).toBe(30);
    expect(advanceDue(order({ lines: mixed, total: 105, shipping: 5 }), r)).toBe(30);
    // A discount comes off every line alike: 90 left, a made-to-order share of 54, half of it.
    expect(advanceDue(order({ lines: mixed, total: 90 }), r)).toBe(27);
    expect(advanceDue(order({ lines: [{ amount: 100, madeToOrder: false }] }), r)).toBeNull();
  });

  it("asks the whole delivered order, delivery fee included, under delivery", () => {
    const r = rule({ scope: "delivery" });
    expect(advanceDue(order({ total: 105, shipping: 5 }), r)).toBe(31.5);
    expect(advanceDue(order({ fulfillment: "pickup" }), r)).toBeNull();
    expect(advanceDue(order({ fulfillment: "digital" }), r)).toBeNull();
    expect(advanceDue(order({ fulfillment: "appointment" }), r)).toBeNull();
  });

  it("asks a delivered order whole, any other order its made-to-order lines, under both", () => {
    const r = rule({ scope: "made_to_order_or_delivery", percent: 40 });
    expect(advanceDue(order({ lines: mixed, total: 105, shipping: 5 }), r)).toBe(42);
    expect(advanceDue(order({ lines: mixed, fulfillment: "pickup" }), r)).toBe(24);
    expect(advanceDue(order({ fulfillment: "pickup" }), r)).toBeNull();
  });

  it("splits an order into the advance and the balance, and says when the rule does not apply", () => {
    expect(advanceForOrder(order(), rule())).toMatchObject({
      applies: true,
      dueNow: 30,
      balance: 70,
      of: "order",
    });
    expect(
      advanceForOrder(order({ lines: mixed }), rule({ scope: "made_to_order", percent: 50 })),
    ).toMatchObject({ applies: true, dueNow: 30, balance: 70, of: "made_to_order" });
    expect(
      advanceForOrder(order({ fulfillment: "pickup" }), rule({ scope: "delivery" })),
    ).toMatchObject({ applies: false, dueNow: 100, balance: 0 });
    expect(advanceForOrder(order({ total: 80 }), rule({ percent: 100 }))).toMatchObject({
      applies: true,
      dueNow: 80,
      balance: 0,
    });
  });

  it("takes cash on delivery away, and nothing else, only where the rule applies", () => {
    const methods = [{ id: "cod" }, { id: "card" }, { id: "benefit" }];
    expect(methodsUnderAdvance(methods, true).map((m) => m.id)).toEqual(["card", "benefit"]);
    expect(methodsUnderAdvance(methods, false)).toHaveLength(3);
  });

  it("refuses a percentage that is empty, not a number or outside 1 to 100", () => {
    expect(advancePercentError(30, false)).toBeNull();
    expect(advancePercentError(1, false)).toBeNull();
    expect(advancePercentError(100, false)).toBeNull();
    expect(advancePercentError("", false)).toMatch(/Enter the advance/);
    expect(advancePercentError("abc", true)).toBe("اكتب نسبة الدفعة المقدمة.");
    expect(advancePercentError(0, false)).toMatch(/1% to 100%/);
    expect(advancePercentError(120, true)).toBe("النسبة من 1% إلى 100%.");
  });

  it("tells the customer what to pay now and what stays due, in both languages", () => {
    const whole = advanceForOrder(order(), rule());
    expect(advanceLines(whole, { isAr: false, money })).toEqual([
      "Advance payment (30%) due now: BHD 30.000",
      "Balance BHD 70.000 on delivery",
    ]);
    expect(advanceLines(whole, { isAr: true, money, balanceWhen: "event" })).toEqual([
      "الدفعة المقدمة (30%) تُدفع الآن: BHD 30.000",
      "المتبقي BHD 70.000 يوم المناسبة",
    ]);
    const part = advanceForOrder(
      order({ lines: mixed }),
      rule({ scope: "made_to_order", percent: 50 }),
    );
    expect(advanceLines(part, { isAr: false, money })[0]).toBe(
      "Advance payment (50% of the made-to-order items) due now: BHD 30.000",
    );
    expect(advanceLines(part, { isAr: true, money })[0]).toContain("من المنتجات حسب الطلب");
    expect(
      advanceLines(advanceForOrder(order({ total: 80 }), rule({ percent: 100 })), {
        isAr: false,
        money,
      }),
    ).toEqual(["The full amount is paid now: BHD 80.000"]);
    expect(
      advanceLines(advanceForOrder(order(), rule({ enabled: false })), { isAr: false, money }),
    ).toEqual([]);
  });
});

describe("a store's own rules in the checkout's preview", () => {
  const own = (over: Partial<AdvanceRuleDef> = {}): AdvanceRuleDef => ({
    fulfillment: [],
    madeToOrder: null,
    productIds: [],
    categorySlugs: [],
    kind: "percent",
    value: 50,
    min: null,
    max: null,
    includeFee: false,
    minTotal: null,
    maxTotal: null,
    customer: "any",
    ...over,
  });

  it("asks the rules of its own first and the general rule for what they leave", () => {
    const r = rule({ rules: [own({ madeToOrder: true })] });
    // 60 made to order at 50% = 30, the 40 left at the general 30% = 12.
    expect(advanceDue(order({ lines: mixed }), r)).toBe(42);
    const split = advanceForOrder(order({ lines: mixed }), r);
    expect(split).toMatchObject({ applies: true, dueNow: 42, balance: 58, percent: null });
    expect(advanceLines(split, { isAr: false, money })[0]).toBe(
      "Advance payment due now: BHD 42.000",
    );
  });

  it("names the share when one percentage rule is all that applies to part of the order", () => {
    const r = rule({ enabled: true, scope: "made_to_order", rules: [own({ productIds: ["p1"] })] });
    const split = advanceForOrder(
      order({ lines: [{ amount: 100, madeToOrder: false, productId: "p1" }] }),
      r,
    );
    expect(split).toMatchObject({ applies: true, percent: 50, of: "order", dueNow: 50 });
    const part = advanceForOrder(
      order({
        lines: [
          { amount: 60, madeToOrder: false, productId: "p1" },
          { amount: 40, madeToOrder: false, productId: "p2" },
        ],
      }),
      r,
    );
    expect(part).toMatchObject({ percent: 50, of: "part", dueNow: 30 });
    expect(advanceLines(part, { isAr: false, money })[0]).toBe(
      "Advance payment (50% of the covered items) due now: BHD 30.000",
    );
    expect(advanceLines(part, { isAr: true, money })[0]).toContain("من المنتجات المشمولة");
  });

  it("does nothing while the rule is switched off, however many rules the store has", () => {
    expect(advanceDue(order(), rule({ enabled: false, rules: [own()] }))).toBeNull();
  });
});

describe("rules that look at the order's total and at the customer", () => {
  const big = (over: Partial<AdvanceRuleDef> = {}): AdvanceRuleDef => ({
    fulfillment: [],
    madeToOrder: null,
    productIds: [],
    categorySlugs: [],
    kind: "percent",
    value: 50,
    min: null,
    max: null,
    includeFee: false,
    minTotal: null,
    maxTotal: null,
    customer: "any",
    ...over,
  });

  it("reaches an order within its least and most total", () => {
    const r = rule({ rules: [big({ minTotal: 100, maxTotal: 200 })] });
    expect(advanceDue(order({ total: 100, lines: [{ amount: 100, madeToOrder: false }] }), r)).toBe(
      50,
    );
    expect(advanceDue(order({ total: 200, lines: [{ amount: 200, madeToOrder: false }] }), r)).toBe(
      100,
    );
    // Outside the range the general 30% takes the order.
    expect(advanceDue(order({ total: 99, lines: [{ amount: 99, madeToOrder: false }] }), r)).toBe(
      29.7,
    );
    expect(advanceDue(order({ total: 201, lines: [{ amount: 201, madeToOrder: false }] }), r)).toBe(
      60.3,
    );
  });

  it("reaches a new or a returning customer, and reads an unknown customer as new", () => {
    const r = rule({
      rules: [big({ customer: "new" }), big({ customer: "returning", value: 10 })],
    });
    expect(advanceDue(order({ returning: false }), r)).toBe(50);
    expect(advanceDue(order({}), r)).toBe(50);
    expect(advanceDue(order({ returning: true }), r)).toBe(10);
  });
});
