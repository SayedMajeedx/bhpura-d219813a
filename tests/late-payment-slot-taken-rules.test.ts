import { describe, expect, it } from "vitest";
import {
  cardSteps,
  holdRanOutText,
  lateTransferHours,
  listedOnDay,
  slotTaken,
} from "../src/features/bookings/lib/booking-actions";
import { waitingCount, waitingOnStore } from "../src/features/bookings/lib/waiting-on-store";
import { transferApprovedMessage } from "../src/features/orders/lib/transfer-approval";

// A payment that arrives after a booking's hold ran out, as staff read it (the database side is
// tests/late-payment-slot-taken-migration.test.ts).

const now = new Date("2026-10-26T12:00:00Z");

const order = (status: string, paymentStatus = "unpaid", paid = 0) => ({
  id: "o1",
  invoice_number: 1001,
  public_invoice_token: "t",
  status,
  payment_status: paymentStatus,
  total: 70,
  advance_paid: paid,
  currency: "BHD",
});

const waitingTransfer = (holdEnds: string) => ({
  status: "hold",
  starts_at: "2026-10-31T15:00:00Z",
  hold_expires_at: holdEnds,
  orders: order("pending_verification"),
});

const bumped = {
  status: "expired",
  starts_at: "2026-10-31T15:00:00Z",
  hold_expires_at: "2026-10-25T09:00:00Z",
  late_payment_slot_taken_at: "2026-10-26T11:00:00Z",
  orders: order("confirmed", "paid", 70),
};

describe("a transfer waiting after its booking's hold ran out", () => {
  it("is counted in whole hours since the hold ran out", () => {
    expect(lateTransferHours(waitingTransfer("2026-10-26T07:30:00Z"), now)).toBe(4);
    expect(lateTransferHours(waitingTransfer("2026-10-26T11:40:00Z"), now)).toBe(0);
  });

  it("is not late while the hold runs, nor when no receipt waits", () => {
    expect(lateTransferHours(waitingTransfer("2026-10-26T20:00:00Z"), now)).toBeNull();
    expect(
      lateTransferHours(
        { ...waitingTransfer("2026-10-26T07:00:00Z"), orders: order("pending") },
        now,
      ),
    ).toBeNull();
  });

  it("is said in the reader's language before it is approved", () => {
    expect(holdRanOutText(5, true)).toMatch(/^انتهت مهلة الحجز منذ 5 ساعات\./);
    expect(holdRanOutText(2, true)).toContain("منذ ساعتين");
    expect(holdRanOutText(0, true)).toContain("منذ أقل من ساعة");
    expect(holdRanOutText(1, false)).toMatch(/^The hold ran out 1 hour ago\./);
    expect(holdRanOutText(3, false)).toContain("does not confirm the booking");
  });
});

describe("a booking paid after its day was taken", () => {
  it("is told apart from a hold that ran out unpaid", () => {
    expect(slotTaken(bumped)).toBe(true);
    expect(slotTaken({ ...bumped, late_payment_slot_taken_at: null })).toBe(false);
    expect(slotTaken({ ...bumped, status: "confirmed" })).toBe(false);
  });

  it("stays on its day and waits for the store, to be moved or cancelled, never confirmed over the other", () => {
    expect(listedOnDay(bumped, now)).toBe(true);
    expect(cardSteps(bumped, now)).toEqual(["cancelled"]);
    const waiting = waitingOnStore([bumped, { status: "requested" }]);
    expect(waiting.slotTaken).toEqual([bumped]);
    expect(waitingCount([bumped, { status: "requested" }])).toBe(2);
  });

  it("is what the approval says, in place of 'approved'", () => {
    const result = { advanceOnly: false, alreadyPaid: false, slotTaken: true };
    expect(transferApprovedMessage(result, "ar", { appointment: true })).toMatch(
      /^تم تسجيل الدفع، لكن الموعد حُجز لعميل آخر/,
    );
    expect(transferApprovedMessage(result, "en")).toContain("Move the booking to a free time");
    expect(transferApprovedMessage({ advanceOnly: false, alreadyPaid: false }, "en")).toBe(
      "Payment verified and approved",
    );
  });
});
