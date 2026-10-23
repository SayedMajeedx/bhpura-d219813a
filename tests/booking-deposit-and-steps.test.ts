import { describe, expect, it } from "vitest";
import {
  balanceWhen,
  cardIsOnlyMethod,
  depositSentence,
  depositTerms,
  invoiceDepositPercent,
  takenDepositPercent,
} from "../src/lib/bookings/deposit";
import {
  cancelMoney,
  cardSteps,
  donePlan,
  listedOnDay,
  shownStatus,
} from "../src/features/bookings/lib/booking-actions";

// The deposit a shopper is promised, and the steps staff take on a booking.

describe("the deposit a booking takes", () => {
  const shop = { card_enabled: true, benefit_enabled: true, cod_enabled: false };

  it("is the store's percentage only while it takes cards, in a shop", () => {
    expect(takenDepositPercent(20, shop)).toBe(20);
    // A transfer or cash pays the whole order: no card, no deposit.
    expect(takenDepositPercent(20, { ...shop, card_enabled: false })).toBe(0);
    expect(takenDepositPercent(20, { ...shop, storefront_mode: "catalog" })).toBe(0);
    expect(takenDepositPercent(0, shop)).toBe(0);
    expect(takenDepositPercent(null, shop)).toBe(0);
    expect(takenDepositPercent(20, null)).toBe(0);
  });

  it("says 'by card' unless a card is the only way to pay", () => {
    expect(cardIsOnlyMethod(shop)).toBe(false);
    expect(cardIsOnlyMethod({ card_enabled: true })).toBe(true);
  });

  it("says when the rest is due by the store's terms, on the day when it wrote none", () => {
    const terms = depositTerms({ deposit_percent: 25 }, shop, { balance_due_days: 3 });
    expect(terms).toEqual({ percent: 25, cardOnly: false, balanceDueDays: 3 });
    expect(depositSentence(terms, false)).toBe(
      "Paying by card: a 25% deposit when you book, the rest 3 days before.",
    );
    expect(depositSentence(terms, true)).toBe(
      "عند الدفع بالبطاقة: عربون 25% عند الحجز، والباقي قبل الموعد بـ 3 أيام.",
    );
    const onTheDay = depositTerms({ deposit_percent: 25 }, { card_enabled: true }, null);
    expect(depositSentence(onTheDay, false)).toBe(
      "A 25% deposit when you book, the rest on the day.",
    );
    expect(depositSentence(onTheDay, true)).toBe("عربون 25% عند الحجز، والباقي يوم الموعد.");
    expect(depositSentence({ ...onTheDay, percent: 0 }, false)).toBeNull();
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
