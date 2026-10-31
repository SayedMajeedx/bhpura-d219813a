import { describe, expect, it } from "vitest";
import {
  giftCardStatementLines,
  hasGiftCards,
  readGiftCardReport,
} from "../src/features/finance-reports/lib/gift-card-report";
import { statementSheet } from "../src/features/finance-reports/lib/statement-sheet";
import { monthsEnding } from "../src/features/finance-reports/lib/statement";

// Gift cards in the reports (step three): money held, not sales. The statement's lines read the
// cards' ledger per month; a store that never had a card has no section at all.

const report = readGiftCardReport({
  periods: [
    { sold: 50, sold_count: 1, sold_cash: 50, held_at_end: 50 },
    { sold: 40, given: 10, spent: 30, written_off: 5, held_at_end: 65 },
  ],
  now: { held: 65, held_cards: 2 },
});

describe("the statement's gift card lines", () => {
  it("sum what came in and went out, and give a balance as it stood at the last month's end", () => {
    const lines = giftCardStatementLines(report.periods);
    const line = (key: string) => lines.find((l) => l.key === key)!;
    expect(line("gift_cards_sold")).toMatchObject({ values: [50, 40], total: 90 });
    expect(line("gift_cards_given").total).toBe(10);
    expect(line("gift_cards_spent").total).toBe(30);
    expect(line("gift_cards_written_off").total).toBe(5);
    expect(line("gift_cards_held")).toMatchObject({ values: [50, 65], total: 65 });
    expect(lines.every((l) => l.section === "gift_cards" && l.kind === "memo")).toBe(true);
  });

  it("leave out what a store never did, and the whole section for a store with no card", () => {
    const quiet = readGiftCardReport({ periods: [{ sold: 20, held_at_end: 20 }] }).periods;
    expect(giftCardStatementLines(quiet).map((l) => l.key)).toEqual([
      "gift_cards_sold",
      "gift_cards_spent",
      "gift_cards_held",
    ]);
    const none = readGiftCardReport({ periods: [{}, {}] }).periods;
    expect(hasGiftCards(none)).toBe(false);
    expect(giftCardStatementLines(none)).toEqual([]);
    expect(readGiftCardReport(null)).toEqual({
      periods: [],
      now: { held: 0, heldCards: 0, heldExpired: 0 },
    });
  });

  it("compare with the same months a year earlier", () => {
    const prior = readGiftCardReport({ periods: [{ sold: 30, held_at_end: 30 }, {}] }).periods;
    const sold = giftCardStatementLines(report.periods, prior).find(
      (l) => l.key === "gift_cards_sold",
    )!;
    expect(sold.prior).toBe(30);
    expect(sold.change).toBeCloseTo(200);
  });

  it("go into the Excel copy under their own heading", () => {
    const months = monthsEnding(2026, 10, 2, new Date(2026, 10, 5));
    const sheet = statementSheet({
      lines: giftCardStatementLines(report.periods),
      months,
      currency: "BHD",
      digits: 3,
      lang: "en",
      storeName: "Pura Line",
      timeZone: "Asia/Bahrain",
      compare: false,
    });
    const labels = sheet.rows.map((r) => r[0]?.value);
    expect(labels).toContain("Gift cards (money held, not sales)");
    expect(labels).toContain("Held on cards at the month's end");
  });
});
