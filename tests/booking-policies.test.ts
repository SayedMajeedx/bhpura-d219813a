import { describe, expect, it } from "vitest";
import {
  NO_POLICY,
  balanceDueDate,
  balanceReminder,
  policyColumns,
  policyFormError,
  policyFormFrom,
  policyLines,
} from "../src/lib/bookings/policies";

const policy = {
  ...NO_POLICY,
  balance_due_days: 7,
  reschedule_months: 3,
  terms_en: "Cancel by message.",
  terms_ar: "الإلغاء عبر رسالة.",
};

describe("booking policies", () => {
  it("counts the balance's due day back from the event", () => {
    expect(balanceDueDate("2026-10-20", 7)).toBe("2026-10-13");
    expect(balanceDueDate("2026-10-03", 5)).toBe("2026-09-28");
    expect(balanceDueDate("2026-10-20", 0)).toBe("2026-10-20");
  });

  it("says what a customer should know, in order", () => {
    expect(
      policyLines(policy, { isAr: false, depositPercent: 30, eventDay: "2026-10-20" }),
    ).toEqual([
      "The 30% deposit is non-refundable.",
      "The balance is due 7 days before the event (2026-10-13).",
      "You can move your booking to another date within 3 months.",
      "Cancel by message.",
    ]);
    expect(policyLines(policy, { isAr: true, depositPercent: 30 })).toEqual([
      "عربون 30% غير قابل للاسترداد.",
      "يُدفع الرصيد المتبقي قبل المناسبة بـ 7 أيام.",
      "يمكن نقل الحجز إلى موعد آخر خلال 3 أشهر.",
      "الإلغاء عبر رسالة.",
    ]);
    expect(
      policyLines({ ...NO_POLICY, deposit_refundable: true }, { isAr: false, depositPercent: 20 }),
    ).toEqual(["The 20% deposit is refunded if you cancel."]);
  });

  it("says nothing for a store with no policy, and falls back between languages", () => {
    expect(policyLines(NO_POLICY, { isAr: false })).toEqual([]);
    expect(policyLines({ ...NO_POLICY, balance_due_days: 0 }, { isAr: false })).toEqual([
      "The balance is due on the day of the event.",
    ]);
    expect(policyLines({ ...NO_POLICY, terms_en: "English only" }, { isAr: true })).toEqual([
      "English only",
    ]);
    expect(policyLines({ ...NO_POLICY, reschedule_months: 0 }, { isAr: false })).toEqual([]);
  });

  it("works out what is still to pay and when", () => {
    expect(balanceReminder(policy, { event_date: "2026-10-20", total: 100, paid: 30 })).toEqual({
      balance: 70,
      due: "2026-10-13",
    });
    expect(balanceReminder(NO_POLICY, { event_date: "2026-10-20", total: 100, paid: 0 })).toEqual({
      balance: 100,
      due: null,
    });
    expect(balanceReminder(policy, { event_date: "2026-10-20", total: 100, paid: 100 })).toBeNull();
  });

  it("reads and writes the merchant's form, and refuses nonsense", () => {
    const form = policyFormFrom(policy);
    expect(form).toMatchObject({ balance_due_days: "7", reschedule_months: "3" });
    expect(policyFormError(form, false)).toBeNull();
    expect(policyColumns(form)).toEqual(policy);
    expect(policyColumns(policyFormFrom(null))).toEqual(NO_POLICY);
    expect(policyFormError({ ...form, balance_due_days: "x" }, false)).toMatch(/Balance days/);
    expect(policyFormError({ ...form, balance_due_days: "400" }, false)).toMatch(/0 to 365/);
    expect(policyFormError({ ...form, reschedule_months: "-1" }, true)).toMatch(/أشهر النقل/);
    expect(policyFormError({ ...form, terms_en: "x".repeat(2001) }, false)).toMatch(/2000/);
    expect(policyColumns({ ...form, terms_en: "  ", balance_due_days: "" })).toMatchObject({
      terms_en: null,
      balance_due_days: null,
    });
  });
});
