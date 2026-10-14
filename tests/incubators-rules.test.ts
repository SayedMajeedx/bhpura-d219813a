import { describe, expect, it } from "vitest";
import { batchTransferRefusal, incubatorErrorMessage } from "../src/features/incubators/lib/errors";
import {
  incubatorDetails,
  incubatorDetailsProblem,
  itemTerms,
  localDateTimeValue,
  newIncubatorCurrency,
  paymentDetails,
  returnDetails,
  saleDetails,
  saleProblem,
} from "../src/features/incubators/lib/forms";
import { movementLabel, movementLines } from "../src/features/incubators/lib/movements";
import {
  buildStatement,
  localDay,
  periodText,
  statementHtml,
  statementMessage,
  statementPeriod,
} from "../src/features/incubators/lib/statement";
import {
  calendarDay,
  commissionTerms,
  filterStock,
  incubatorChips,
  incubatorSummary,
  saleCanBeReversed,
  saleProfit,
  saleState,
  saleStateLabel,
  serverSummary,
  settlementNote,
  settlementsByPayment,
} from "../src/features/incubators/lib/summary";
import type {
  Incubator,
  Movement,
  Payment,
  Sale,
  StockItem,
} from "../src/features/incubators/types";

// The partners' page's own rules: its figures, what a sale and a payment say, the words for a
// refusal, the forms' values, the history and the statement of account.

const money = (amount: number) => `BHD ${amount.toFixed(3)}`;
const variant = (name = "Abaya") => ({
  id: "v1",
  sku: "AB-1",
  barcode: "629000111",
  size: "M",
  color: "Black",
  stock_main: 0,
  selling_price: 30,
  products: { name, name_ar: "عباية" },
});
const stockLine = (patch: Partial<StockItem> = {}): StockItem => ({
  id: "s1",
  incubator_id: "i1",
  variant_id: "v1",
  external_code: "SB-7",
  quantity: 3,
  consignment_price: 30,
  commission_type: "percentage",
  commission_value: 10,
  product_variants: variant(),
  ...patch,
});
const sale = (patch: Partial<Sale> = {}): Sale => ({
  id: "sale1",
  incubator_id: "i1",
  variant_id: "v1",
  quantity: 2,
  unit_price: 30,
  gross_amount: 60,
  commission_amount: 6,
  net_due: 54,
  paid_amount: 0,
  // Noon, so the day is the same on any reader's calendar.
  sold_at: "2026-09-15T12:00:00Z",
  status: "confirmed",
  product_cost_snapshot: 20,
  packaging_cost_snapshot: 1.5,
  product_variants: variant(),
  ...patch,
});
const payment = (patch: Partial<Payment> = {}): Payment => ({
  id: "pay1",
  incubator_id: "i1",
  amount: 20,
  payment_date: "2026-09-20",
  payment_method: "cash",
  reference: "REF-1",
  ...patch,
});
const partner = (patch: Partial<Incubator> = {}): Incubator => ({
  id: "i1",
  name: "Souq Box",
  contact_name: null,
  phone: "33112233",
  email: null,
  commission_type: "percentage",
  commission_value: 10,
  settlement_day: 5,
  currency: "BHD",
  notes: null,
  is_active: true,
  packaging_policy: "incubator",
  fixed_packaging_cost: 0,
  ...patch,
});

describe("a partner's figures", () => {
  it("count what is on the shelf, what was sold, the two shares, and what is owed", () => {
    const summary = incubatorSummary(
      [stockLine(), stockLine({ id: "s2", quantity: 0 })],
      [sale(), sale({ id: "sale2", paid_amount: 54 }), sale({ id: "sale3", status: "reversed" })],
      [payment({ amount: 54 })],
    );
    expect(summary).toEqual({
      units: 3,
      stockValue: 90,
      soldUnits: 4,
      gross: 120,
      commission: 12,
      net: 108,
      paid: 54,
      due: 54,
    });
  });

  it("add prices to the fils, without a binary tail", () => {
    const sales = [0.1, 0.2, 0.3].map((net, index) =>
      sale({ id: `s${index}`, gross_amount: net, commission_amount: 0, net_due: net }),
    );
    expect(incubatorSummary([], sales, []).gross).toBe(0.6);
    expect(incubatorSummary([], sales, []).due).toBe(0.6);
  });

  it("give each partner its own pieces and its own debt in the picker", () => {
    const chips = incubatorChips(
      [partner(), partner({ id: "i2", name: "Arcade", is_active: false })],
      [stockLine(), stockLine({ id: "s2", incubator_id: "i2", quantity: 7 })],
      [sale(), sale({ id: "sale2", incubator_id: "i2", net_due: 10, paid_amount: 4 })],
    );
    expect(chips.map((chip) => [chip.name, chip.units, chip.due, chip.isActive])).toEqual([
      ["Souq Box", 3, 54, true],
      ["Arcade", 7, 6, false],
    ]);
  });
});

describe("a sale", () => {
  it("is due, part paid, paid or reversed", () => {
    expect(saleState(sale())).toBe("due");
    expect(saleState(sale({ paid_amount: 10 }))).toBe("part_paid");
    expect(saleState(sale({ paid_amount: 54 }))).toBe("paid");
    expect(saleState(sale({ status: "reversed" }))).toBe("reversed");
    expect(saleStateLabel("part_paid", "en")).toBe("Part paid");
    expect(saleStateLabel("due", "ar")).toBe("مستحقة");
  });

  it("can be reversed only while nothing was paid against it", () => {
    expect(saleCanBeReversed(sale())).toBe(true);
    expect(saleCanBeReversed(sale({ paid_amount: 0.001 }))).toBe(false);
    expect(saleCanBeReversed(sale({ status: "reversed" }))).toBe(false);
  });

  it("says what the store kept after the pieces' cost and packaging, when it knows the cost", () => {
    expect(saleProfit(sale())).toBe(32.5);
    expect(saleProfit(sale({ product_cost_snapshot: null }))).toBeNull();
    expect(saleProfit(sale({ packaging_cost_snapshot: null }))).toBe(34);
  });
});

describe("a stock line", () => {
  it("says its commission as a percentage or an amount per piece", () => {
    expect(commissionTerms(stockLine(), money, "en")).toBe("10%");
    const fixed = stockLine({ commission_type: "fixed", commission_value: 2 });
    expect(commissionTerms(fixed, money, "en")).toBe("BHD 2.000 each");
    expect(commissionTerms(fixed, money, "ar")).toBe("BHD 2.000 للقطعة");
  });

  it("is found by its name in either language, our code or the partner's", () => {
    const lines = [
      stockLine(),
      stockLine({ id: "s2", external_code: null, product_variants: null }),
    ];
    for (const needle of ["abaya", "عباية", "ab-1", "sb-7", " 629000 "]) {
      expect(filterStock(lines, needle), needle).toHaveLength(1);
    }
    expect(filterStock(lines, "")).toHaveLength(2);
    expect(filterStock(lines, "nothing")).toEqual([]);
  });
});

describe("a payment", () => {
  it("lists the sales it settled, largest part first", () => {
    const settled = settlementsByPayment(
      [
        { payment_id: "pay1", sale_id: "sale1", amount: 10 },
        { payment_id: "pay1", sale_id: "sale2", amount: 44 },
        { payment_id: "pay2", sale_id: "gone", amount: 5 },
      ],
      [sale(), sale({ id: "sale2" })],
    );
    expect(settled.get("pay1")?.map((part) => [part.saleId, part.amount])).toEqual([
      ["sale2", 44],
      ["sale1", 10],
    ]);
    expect(settled.get("pay2")?.[0].sale).toBeNull();
    expect(settled.get("pay3")).toBeUndefined();
  });
});

describe("a refusal from the database", () => {
  it("is said in words, in the page's language", () => {
    expect(incubatorErrorMessage(new Error("PAYMENT_EXCEEDS_AMOUNT_DUE"), "en")).toBe(
      "The payment is more than the partner owes",
    );
    expect(incubatorErrorMessage(new Error("PAYMENT_EXCEEDS_AMOUNT_DUE"), "ar")).toBe(
      "الدفعة أكبر من المبلغ المستحق",
    );
    expect(incubatorErrorMessage({ message: "INSUFFICIENT_INCUBATOR_STOCK" }, "en")).toMatch(
      /does not hold that many/,
    );
    // The longer code wins over one it contains.
    expect(incubatorErrorMessage(new Error("INSUFFICIENT_STOCK:v1"), "en")).toBe(
      "There is not enough stock for this",
    );
  });

  it("never shows a bare code, and keeps a sentence it was given", () => {
    expect(incubatorErrorMessage(new Error("SOME_NEW_CODE"), "en")).toBe("Could not save");
    expect(incubatorErrorMessage(new Error("SOME_NEW_CODE:detail"), "ar")).toBe("تعذر حفظ العملية");
    expect(incubatorErrorMessage(null, "en")).toBe("Could not save");
    expect(incubatorErrorMessage(new Error("The connection was lost"), "en")).toBe(
      "The connection was lost",
    );
  });
});

describe("the forms", () => {
  it("turn a partner's fields into its details, empty text into nothing", () => {
    expect(
      incubatorDetails({
        name: "  Souq Box ",
        contact_name: "",
        phone: " 33112233 ",
        commission_type: "fixed",
        commission_value: "2.5",
        settlement_day: "",
        packaging_policy: "our_bom",
        fixed_packaging_cost: "",
        notes: " ",
      }),
    ).toEqual({
      name: "Souq Box",
      contact_name: null,
      phone: "33112233",
      email: null,
      commission_type: "fixed",
      commission_value: 2.5,
      settlement_day: null,
      packaging_policy: "our_bom",
      fixed_packaging_cost: 0,
      notes: null,
      // A partner takes no pickups until the store says so.
      pickup_enabled: false,
      pickup_address_ar: null,
      pickup_address_en: null,
      pickup_location_url: null,
      pickup_notes_ar: null,
      pickup_notes_en: null,
      transfer_days: null,
    });
  });

  it("refuse details that make no sense", () => {
    const details = (patch: Record<string, string>) =>
      incubatorDetails({ name: "Souq Box", commission_value: "10", ...patch });
    expect(incubatorDetailsProblem(details({}), "en")).toBeNull();
    expect(incubatorDetailsProblem(details({ name: " " }), "en")).toBe("Enter the partner's name");
    expect(incubatorDetailsProblem(details({ commission_value: "101" }), "en")).toMatch(/100/);
    expect(
      incubatorDetailsProblem(details({ commission_type: "fixed", commission_value: "101" }), "en"),
    ).toBeNull();
    expect(incubatorDetailsProblem(details({ commission_value: "-1" }), "ar")).toBe(
      "العمولة لا تكون بالسالب",
    );
    expect(incubatorDetailsProblem(details({ settlement_day: "32" }), "en")).toMatch(/1 to 31/);
    expect(incubatorDetailsProblem(details({ settlement_day: "28" }), "en")).toBeNull();
  });

  it("send a piece's terms, a sale, a return and a payment as the functions take them", () => {
    expect(
      itemTerms({ external_code: " SB-9 ", price: "6.5", commission_value: "10" }, { id: "s1" }),
    ).toEqual({
      inventoryId: "s1",
      externalCode: "SB-9",
      consignmentPrice: 6.5,
      commissionType: "percentage",
      commissionValue: 10,
    });
    expect(
      saleDetails({ quantity: "2", price: "28", sold_at: "2026-09-15T12:00" }, "i1", {
        variant_id: "v1",
      }),
    ).toMatchObject({ incubatorId: "i1", variantId: "v1", quantity: 2, unitPrice: 28 });
    expect(returnDetails({ quantity: "1", notes: "" }, "i1", { variant_id: "v1" })).toEqual({
      incubatorId: "i1",
      variantId: "v1",
      quantity: 1,
      notes: null,
    });
    expect(
      paymentDetails({ amount: "20", payment_date: "2026-09-20", payment_method: " cash " }, "i1"),
    ).toEqual({
      incubatorId: "i1",
      amount: 20,
      paymentDate: "2026-09-20",
      paymentMethod: "cash",
      reference: null,
      notes: null,
    });
  });

  it("refuse a sale of pieces the partner does not hold, or dated in the future", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const at = (iso: string, quantity = 1, unitPrice = 30) => ({
      quantity,
      unitPrice,
      soldAt: iso,
    });
    expect(saleProblem(at("2026-09-15T11:00:00Z"), 3, "en", now)).toBeNull();
    expect(saleProblem(at("2026-09-15T11:00:00Z", 4), 3, "en", now)).toBe(
      "The partner holds only 3",
    );
    expect(saleProblem(at("2026-09-15T11:00:00Z", 1.5), 3, "en", now)).toBe(
      "Enter a whole quantity",
    );
    expect(saleProblem(at("2026-09-15T11:00:00Z", 1, -1), 3, "ar", now)).toBe(
      "السعر لا يكون بالسالب",
    );
    expect(saleProblem(at("2026-09-16T12:00:00Z"), 3, "en", now)).toBe(
      "The sale date is in the future",
    );
  });

  it("start a new partner in the store's currency", () => {
    expect(newIncubatorCurrency("KWD", partner())).toBe("KWD");
    expect(newIncubatorCurrency(" ", partner({ currency: "SAR" }))).toBe("SAR");
    expect(newIncubatorCurrency(null, null)).toBe("BHD");
    expect(localDateTimeValue(new Date(2026, 8, 15, 9, 5))).toBe("2026-09-15T09:05");
  });
});

describe("a partner's history", () => {
  const movement = (patch: Partial<Movement>): Movement => ({
    id: "m1",
    incubator_id: "i1",
    variant_id: "v1",
    movement_type: "transfer_in",
    quantity_delta: 3,
    reference_type: null,
    reference_id: null,
    notes: "Weekend restock",
    occurred_at: "2026-09-01T10:00:00Z",
    product_variants: variant(),
    ...patch,
  });

  it("names every kind of movement in both languages", () => {
    for (const type of [
      "transfer_in",
      "return",
      "sale",
      "sale_reversal",
      "adjustment",
      "order_reserve",
      "order_release",
    ]) {
      expect(movementLabel(type, "en")).not.toBe(type);
      expect(movementLabel(type, "ar")).not.toBe(type);
    }
    expect(movementLabel("something_new", "en")).toBe("something_new");
  });

  it("reads pieces in and out with a sign, and links an order's movement to its order", () => {
    const [sent, taken] = movementLines(
      [
        movement({}),
        movement({
          id: "m2",
          movement_type: "order_reserve",
          quantity_delta: -2,
          reference_type: "order",
          reference_id: "o1",
          notes: "Reserved by an order",
        }),
      ],
      "en",
    );
    expect(sent).toMatchObject({
      label: "Sent to the partner",
      piece: "Abaya · M / Black",
      deltaText: "+3",
      note: "Weekend restock",
      orderId: null,
    });
    expect(taken).toMatchObject({
      label: "Taken by a store order",
      deltaText: "−2",
      note: null,
      orderId: "o1",
    });
  });
});

describe("a partner's statement", () => {
  const now = new Date(2026, 8, 20);
  const input = (period = statementPeriod("this_month", now)) => ({
    incubator: partner(),
    sales: [
      sale(),
      sale({ id: "sale2", sold_at: "2026-08-10T12:00:00Z", paid_amount: 54 }),
      sale({ id: "sale3", status: "reversed" }),
    ],
    payments: [payment(), payment({ id: "pay2", payment_date: "2026-08-12", amount: 54 })],
    period,
    lang: "en" as const,
  });

  it("covers this month, last month or everything", () => {
    expect(statementPeriod("this_month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(statementPeriod("last_month", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(statementPeriod("last_month", new Date(2026, 0, 15))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(statementPeriod("all", now)).toEqual({ from: null, to: null });
    expect(periodText({ from: null, to: null }, "en")).toBe("All sales to date");
    expect(periodText({ from: "2026-09-01", to: "2026-09-30" }, "ar")).toBe(
      "2026-09-01 إلى 2026-09-30",
    );
    expect(localDay("2026-09-15T12:00:00Z")).toBe("2026-09-15");
  });

  it("adds up the period's sales and payments, and says what is owed today in all", () => {
    const month = buildStatement(input());
    expect(month.sales.map((line) => line.id)).toEqual(["sale1"]);
    expect(month.payments.map((line) => line.id)).toEqual(["pay1"]);
    expect(month).toMatchObject({
      soldUnits: 2,
      gross: 60,
      commission: 6,
      net: 54,
      paid: 20,
      // The September sale is unpaid; August's was settled. The balance is for all time.
      balanceDue: 54,
    });
    const everything = buildStatement(input(statementPeriod("all", now)));
    expect(everything.sales.map((line) => line.id)).toEqual(["sale2", "sale1"]);
    expect(everything).toMatchObject({ soldUnits: 4, gross: 120, net: 108, paid: 74 });
  });

  it("leaves reversed sales out: nothing is owed for them", () => {
    const everything = buildStatement(input(statementPeriod("all", now)));
    expect(everything.sales.some((line) => line.id === "sale3")).toBe(false);
  });

  it("prints a page in the reader's direction, with every value escaped", () => {
    const statement = buildStatement({
      ...input(),
      incubator: partner({ name: 'Souq <Box> & "Co"' }),
    });
    const html = statementHtml(statement, {
      lang: "ar",
      brand: "بيورا لاين",
      money,
      today: "2026-09-20",
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("كشف حساب");
    expect(html).toContain("Souq &lt;Box&gt; &amp; &quot;Co&quot;");
    expect(html).not.toContain("<Box>");
    expect(html).toContain("BHD 54.000");
    expect(html).toContain("window.print()");
    const empty = statementHtml(buildStatement({ ...input(), sales: [], payments: [] }), {
      lang: "en",
      brand: "Pura Line",
      money,
      today: "2026-09-20",
    });
    expect(empty).toContain("No sales in this period.");
    expect(empty).toContain("No payments in this period.");
  });

  it("writes the short message a person sends on WhatsApp", () => {
    const message = statementMessage(buildStatement(input()), {
      lang: "en",
      brand: "Pura Line",
      money,
    });
    expect(message.split("\n")).toEqual([
      "Hello Souq Box, here is your statement from Pura Line.",
      "Period: 2026-09-01 to 2026-09-30",
      "Pieces sold: 2",
      "Sales: BHD 60.000",
      "Commission: BHD 6.000",
      "Due to us: BHD 54.000",
      "Paid in the period: BHD 20.000",
      "Balance due today: BHD 54.000",
    ]);
  });
});

describe("the database's figures for a partner", () => {
  const row = {
    incubator_id: "i1",
    units: 3,
    stock_value: "90.000",
    sold_units: 4,
    gross: "120.000",
    commission: "12.000",
    net: "108.000",
    paid: "54.000",
    due: "54.000",
    overdue: "10.500",
    last_settlement: "2026-10-05",
    next_settlement: "2026-11-05",
  };

  it("are read as numbers, with the settlement beside them", () => {
    expect(serverSummary(row)).toEqual({
      units: 3,
      stockValue: 90,
      soldUnits: 4,
      gross: 120,
      commission: 12,
      net: 108,
      paid: 54,
      due: 54,
      settlement: { last: "2026-10-05", next: "2026-11-05", overdue: 10.5 },
    });
    expect(serverSummary({}).settlement).toEqual({ last: null, next: null, overdue: 0 });
  });

  it("replace the loaded rows in the picker once they arrive, and mark what is late", () => {
    const summaries = new Map([["i1", serverSummary(row)]]);
    const chips = incubatorChips(
      [partner(), partner({ id: "i2", name: "Arcade" })],
      [stockLine({ quantity: 99 })],
      [sale({ net_due: 999 })],
      summaries,
    );
    expect(chips[0]).toMatchObject({ units: 3, due: 54, overdue: 10.5 });
    // A partner the database said nothing about keeps the loaded figures.
    expect(chips[1]).toMatchObject({ units: 0, due: 0, overdue: 0 });
  });

  it("do not count a voided payment as money received", () => {
    const figures = incubatorSummary(
      [],
      [sale()],
      [payment({ amount: 20 }), payment({ id: "pay2", amount: 30, voided_at: "2026-09-21" })],
    );
    expect(figures.paid).toBe(20);
  });

  it("use the reader's own calendar day", () => {
    expect(calendarDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("a partner's settlement", () => {
  const options = { money, date: (day: string) => `<${day}>`, lang: "en" as const };

  it("says when the next one is, and what is late since the last", () => {
    expect(
      settlementNote({ last: "2026-10-05", next: "2026-11-05", overdue: 10.5 }, options),
    ).toEqual({
      next: "Next settlement: <2026-11-05>",
      overdue: "Overdue since <2026-10-05>: BHD 10.500",
    });
    expect(settlementNote({ last: "2026-10-05", next: "2026-11-05", overdue: 0 }, options)).toEqual(
      { next: "Next settlement: <2026-11-05>", overdue: null },
    );
    expect(
      settlementNote(
        { last: "2026-10-05", next: "2026-11-05", overdue: 3 },
        { ...options, lang: "ar" },
      ),
    ).toEqual({
      next: "التسوية القادمة: <2026-11-05>",
      overdue: "متأخر منذ <2026-10-05>: BHD 3.000",
    });
  });

  it("says nothing for a partner with no settlement day", () => {
    expect(settlementNote({ last: null, next: null, overdue: 0 }, options)).toBeNull();
    expect(settlementNote(null, options)).toBeNull();
  });
});

describe("a statement after a payment was voided", () => {
  it("leaves the voided payment out, and owes what the database says is owed", () => {
    const statement = buildStatement({
      incubator: partner(),
      sales: [sale()],
      payments: [payment(), payment({ id: "pay2", amount: 30, voided_at: "2026-09-21" })],
      period: statementPeriod("all", new Date(2026, 8, 20)),
      lang: "en",
      balanceDue: 12.345,
    });
    expect(statement.payments.map((line) => line.id)).toEqual(["pay1"]);
    expect(statement.paid).toBe(20);
    expect(statement.balanceDue).toBe(12.345);
  });
});

describe("a batch transfer that is refused", () => {
  const variantId = "00000000-0000-4000-8000-0000000000f2";
  const pieceOf = (id: string) => (id === variantId ? "Abaya - M / Black" : null);

  it("names the piece it stopped on, says why, and that nothing moved", () => {
    expect(
      batchTransferRefusal(new Error(`INSUFFICIENT_MAIN_STOCK:${variantId}`), pieceOf, "en"),
    ).toBe(
      "Abaya - M / Black: The store does not have that many pieces to transfer. Nothing was transferred.",
    );
    expect(
      batchTransferRefusal(new Error(`INSUFFICIENT_MAIN_STOCK:${variantId}`), pieceOf, "ar"),
    ).toBe("Abaya - M / Black: الكمية في مخزون المحل غير كافية للتحويل. لم يُحوَّل شيء.");
  });

  it("still says why when the piece is not one the screen knows", () => {
    expect(batchTransferRefusal(new Error("NOT_AUTHORIZED"), pieceOf, "en")).toBe(
      "You do not have permission to do this (or the partner is inactive). Nothing was transferred.",
    );
    expect(
      batchTransferRefusal(
        new Error("NOT_AUTHORIZED:11111111-1111-4111-8111-111111111111"),
        pieceOf,
        "en",
      ),
    ).toMatch(/^You do not have permission/);
  });

  it("has words for the new refusals", () => {
    for (const code of [
      "VOID_REASON_REQUIRED",
      "PAYMENT_ALREADY_VOIDED",
      "NOTHING_TO_TRANSFER",
      "TOO_MANY_PIECES_IN_ONE_TRANSFER",
    ]) {
      expect(incubatorErrorMessage(new Error(code), "en")).not.toBe("Could not save");
      expect(incubatorErrorMessage(new Error(code), "ar")).not.toBe("تعذر حفظ العملية");
    }
  });
});
