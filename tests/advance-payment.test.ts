import { describe, expect, it } from "vitest";
import {
  advanceLines,
  advancePercentError,
  advanceRuleFrom,
  advanceSplit,
  methodsUnderAdvance,
} from "../src/lib/payments/advance-payment";

const money = (n: number) => `BHD ${n.toFixed(3)}`;

describe("a store's advance-payment rule", () => {
  it("is off unless switched on, and keeps the percentage within 1 to 100", () => {
    expect(advanceRuleFrom(undefined)).toEqual({ enabled: false, percent: 30 });
    expect(advanceRuleFrom({ advance_payment_enabled: true, advance_payment_percent: 40 })).toEqual(
      {
        enabled: true,
        percent: 40,
      },
    );
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
  });

  it("splits a total into the advance (rounded up to the fils) and the balance", () => {
    const rule = { enabled: true, percent: 30 };
    expect(advanceSplit(100, rule)).toEqual({
      applies: true,
      percent: 30,
      dueNow: 30,
      balance: 70,
    });
    expect(advanceSplit(41.25, rule)).toMatchObject({ dueNow: 12.375, balance: 28.875 });
    expect(advanceSplit(10.001, rule)).toMatchObject({ dueNow: 3.001, balance: 7 });
    // The whole total at 100%; nothing asked when off or empty.
    expect(advanceSplit(80, { enabled: true, percent: 100 })).toMatchObject({
      dueNow: 80,
      balance: 0,
      applies: true,
    });
    expect(advanceSplit(80, { enabled: false, percent: 30 })).toMatchObject({
      applies: false,
      dueNow: 80,
      balance: 0,
    });
    expect(advanceSplit(0, rule).applies).toBe(false);
  });

  it("takes cash on delivery away, and nothing else, while it is on", () => {
    const methods = [{ id: "cod" }, { id: "card" }, { id: "benefit" }];
    expect(methodsUnderAdvance(methods, { enabled: true, percent: 30 }).map((m) => m.id)).toEqual([
      "card",
      "benefit",
    ]);
    expect(methodsUnderAdvance(methods, { enabled: false, percent: 30 })).toHaveLength(3);
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
    const split = advanceSplit(100, { enabled: true, percent: 30 });
    expect(advanceLines(split, { isAr: false, money })).toEqual([
      "Advance payment (30%) due now: BHD 30.000",
      "Balance BHD 70.000 on delivery",
    ]);
    expect(advanceLines(split, { isAr: true, money, balanceWhen: "event" })).toEqual([
      "الدفعة المقدمة (30%) تُدفع الآن: BHD 30.000",
      "المتبقي BHD 70.000 يوم المناسبة",
    ]);
    expect(
      advanceLines(advanceSplit(80, { enabled: true, percent: 100 }), { isAr: false, money }),
    ).toEqual(["The full amount is paid now: BHD 80.000"]);
    expect(
      advanceLines(advanceSplit(80, { enabled: false, percent: 30 }), { isAr: false, money }),
    ).toEqual([]);
  });
});
