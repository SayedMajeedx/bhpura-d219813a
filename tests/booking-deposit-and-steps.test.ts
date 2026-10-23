import { describe, expect, it } from "vitest";
import {
  balanceWhen,
  bookingDepositSplit,
  depositSentence,
  depositTerms,
  invoiceDepositPercent,
  takenDepositPercent,
  takesDeposits,
  upfrontSplit,
} from "../src/lib/bookings/deposit";
import { advanceLines, methodsUnderAdvance } from "../src/lib/payments/advance-payment";
import {
  cancelMoney,
  cardSteps,
  donePlan,
  listedOnDay,
  shownStatus,
} from "../src/features/bookings/lib/booking-actions";

// The deposit a shopper is promised, and the steps staff take on a booking.

describe("the deposit a booking takes", () => {
  const shop = { card_enabled: false, benefit_enabled: true };

  it("is the store's percentage while it takes a card or BenefitPay, in a shop", () => {
    expect(takenDepositPercent(20, shop)).toBe(20);
    expect(takenDepositPercent(20, { card_enabled: true })).toBe(20);
    // Neither: the whole booking is paid (in cash), so no deposit is asked.
    expect(takenDepositPercent(20, { card_enabled: false, benefit_enabled: false })).toBe(0);
    expect(takenDepositPercent(20, { ...shop, storefront_mode: "catalog" })).toBe(0);
    expect(takenDepositPercent(0, shop)).toBe(0);
    expect(takenDepositPercent(null, shop)).toBe(0);
    expect(takenDepositPercent(20, null)).toBe(0);
    expect(takesDeposits(shop)).toBe(true);
  });

  it("says when the rest is due by the store's terms, on the day when it wrote none", () => {
    const terms = depositTerms({ deposit_percent: 25 }, shop, { balance_due_days: 3 });
    expect(terms).toEqual({ percent: 25, balanceDueDays: 3 });
    expect(depositSentence(terms, false)).toBe(
      "A 25% deposit when you book, the rest 3 days before.",
    );
    expect(depositSentence(terms, true)).toBe("عربون 25% عند الحجز، والباقي قبل الموعد بـ 3 أيام.");
    const onTheDay = depositTerms({ deposit_percent: 25 }, shop, null);
    expect(depositSentence(onTheDay, false)).toBe(
      "A 25% deposit when you book, the rest on the day.",
    );
    expect(depositSentence(onTheDay, true)).toBe("عربون 25% عند الحجز، والباقي يوم الموعد.");
    expect(depositSentence({ ...onTheDay, percent: 0 }, false)).toBeNull();
    expect(depositSentence({ ...onTheDay, percent: 100 }, false)).toBe(
      "The whole amount is paid when you book.",
    );
  });

  it("divides a booking's checkout as the database rounds it: up to the fils", () => {
    const split = bookingDepositSplit(70.01, { percent: 25, balanceDueDays: 2 });
    expect(split).toEqual({
      applies: true,
      percent: 25,
      of: "order",
      dueNow: 17.503,
      balance: 52.507,
      deposit: { balanceDueDays: 2 },
    });
    expect(bookingDepositSplit(70, { percent: 100, balanceDueDays: null })).toMatchObject({
      applies: true,
      dueNow: 70,
      balance: 0,
    });
    expect(bookingDepositSplit(70, { percent: 0, balanceDueDays: null })).toBeNull();
  });

  it("is told at checkout as a deposit, with the rest by the store's terms", () => {
    const split = bookingDepositSplit(70, { percent: 25, balanceDueDays: 2 })!;
    const money = (n: number) => `BHD ${n.toFixed(3)}`;
    expect(advanceLines(split, { isAr: false, money, balanceWhen: "event" })).toEqual([
      "Deposit (25%) due now: BHD 17.500",
      "Balance BHD 52.500 2 days before",
    ]);
    expect(advanceLines(split, { isAr: true, money })).toEqual([
      "العربون (25%) يُدفع الآن: BHD 17.500",
      "المتبقي BHD 52.500 قبل الموعد بيومين",
    ]);
  });

  it("is what checkout asks now unless a store's advance reaches the order, and hides cash", () => {
    const none = { applies: false, percent: null, of: "order" as const, dueNow: 70, balance: 0 };
    const advance = { ...none, applies: true, percent: 30, dueNow: 21, balance: 49 };
    const deposit = bookingDepositSplit(70, { percent: 25, balanceDueDays: null });
    expect(upfrontSplit(none, deposit)).toBe(deposit);
    expect(upfrontSplit(advance, deposit)).toBe(advance);
    expect(upfrontSplit(none, null)).toBe(none);
    const methods = [{ id: "card" }, { id: "benefit" }, { id: "cod" }];
    expect(methodsUnderAdvance(methods, upfrontSplit(none, deposit).applies)).toEqual([
      { id: "card" },
      { id: "benefit" },
    ]);
  });

  it("counts the days in Arabic as a reader says them", () => {
    expect(balanceWhen(0, true)).toBe("يوم الموعد");
    expect(balanceWhen(1, true)).toBe("قبل الموعد بيوم");
    expect(balanceWhen(2, true)).toBe("قبل الموعد بيومين");
    expect(balanceWhen(14, true)).toBe("قبل الموعد بـ 14 يوماً");
    expect(balanceWhen(1, false)).toBe("1 day before");
  });

  it("is named on an invoice only when the booking took one", () => {
    expect(invoiceDepositPercent({ deposit_amount: "27.000" }, 30)).toBe(30);
    expect(invoiceDepositPercent({ deposit_amount: null }, 30)).toBe(0);
    expect(invoiceDepositPercent(null, 30)).toBe(0);
  });
});

describe("a booking's steps", () => {
  const now = new Date("2026-10-01T09:00:00Z");
  const order = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    invoice_number: 1,
    public_invoice_token: "t",
    status: "confirmed",
    payment_status: "partially_paid",
    total: 100,
    advance_paid: 40,
    currency: "KWD",
    ...over,
  });

  it("reads a hold whose time ran out as expired, and leaves it off its day", () => {
    const lapsed = { status: "hold", hold_expires_at: "2026-10-01T08:59:00Z" };
    expect(shownStatus(lapsed, now)).toBe("expired");
    expect(listedOnDay(lapsed, now)).toBe(false);
    expect(shownStatus({ ...lapsed, hold_expires_at: "2026-10-01T09:10:00Z" }, now)).toBe("hold");
    // A transfer receipt still waiting keeps it in view.
    expect(listedOnDay({ ...lapsed, orders: order({ status: "pending_verification" }) }, now)).toBe(
      true,
    );
    // It can still be confirmed (paid late) or let go.
    expect(cardSteps(lapsed, now)).toEqual(["confirmed", "cancelled"]);
  });

  it("offers done only once the booking's time has come", () => {
    const confirmed = { status: "confirmed", starts_at: "2026-10-01T10:00:00Z" };
    expect(cardSteps(confirmed, now)).toEqual(["cancelled"]);
    expect(cardSteps({ ...confirmed, starts_at: "2026-10-01T08:00:00Z" }, now)).toEqual([
      "completed",
      "cancelled",
    ]);
  });

  it("finishes a booking through its order, collecting what is still owed", () => {
    expect(donePlan({ status: "confirmed", orders: order() })).toEqual({
      kind: "order",
      orderId: "o1",
      collect: 60,
      currency: "KWD",
    });
    expect(donePlan({ status: "confirmed", orders: [order({ advance_paid: 100 })] })).toMatchObject(
      { kind: "order", collect: 0 },
    );
    expect(
      donePlan({ status: "confirmed", orders: order({ status: "pending_verification" }) }),
    ).toEqual({ kind: "verify_first", orderId: "o1" });
    expect(donePlan({ status: "confirmed", orders: order({ status: "completed" }) })).toEqual({
      kind: "booking",
    });
    expect(donePlan({ status: "confirmed", orders: null })).toEqual({ kind: "booking" });
  });

  it("says what was paid when a booking is cancelled", () => {
    expect(cancelMoney({ status: "confirmed", orders: order() })).toEqual({
      hasOrder: true,
      paid: 40,
      currency: "KWD",
    });
    expect(cancelMoney({ status: "requested", orders: null })).toEqual({
      hasOrder: false,
      paid: 0,
      currency: null,
    });
  });
});
