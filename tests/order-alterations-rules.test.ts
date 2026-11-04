import { describe, expect, it } from "vitest";
import {
  alterableLines,
  alterationActions,
  alterationError,
  alterationProblems,
  alterationRequest,
  alterationSupplierMessage,
  alterationTarget,
  alterationsOut,
  changeLine,
  measurementChanges,
  measurementFields,
  whereCharged,
  type AlterForm,
  type OrderAlteration,
} from "../src/features/orders/lib/alterations";
import { alterationReceivedMessage } from "../src/features/orders/lib/stage-messages";
import { jobSheetHtml, type JobSheetPiece } from "../src/features/orders/lib/job-sheet";

// Alterations' pure rules (step 3 of docs/workshop-flow-plan.md): which pieces may go, what
// changes, the form and its request, where the customer pays, the messages and the sheet.

const alteration = (over: Partial<OrderAlteration> = {}): OrderAlteration => ({
  id: "a1",
  order_id: "o1",
  source_order_id: "o1",
  source_item_id: "abaya",
  kind: "alteration",
  changes: [],
  note: null,
  made_by: "supplier",
  purchase_order_item_id: null,
  customer_charge: 5,
  charge_item_id: "charge",
  due_at: null,
  status: "at_workshop",
  created_at: "2026-11-03T10:00:00Z",
  back_at: null,
  handed_over_at: null,
  ...over,
});

const lines = [
  { id: "abaya", description: "Black abaya", quantity: 1, location: "custom" },
  { id: "dress", description: "Ready dress", quantity: 1, location: "main" },
  { id: "fitting", description: "Fitting", quantity: 1, isService: true },
  { id: "charge", description: "Alteration: Black abaya", quantity: 1 },
];

describe("which pieces may go", () => {
  it("any piece for an alteration, a fix only for one the store had made", () => {
    const pieces = alterableLines(lines, { offersAlterations: true, alterations: [] });
    expect(pieces.map((p) => [p.line.id, p.alteration, p.fix])).toEqual([
      ["abaya", true, true],
      ["dress", true, false],
      ["charge", true, false],
    ]);
    // A supplier made the dress: it can be fixed too.
    expect(
      alterableLines(lines, { offersAlterations: true, alterations: [], madeLineIds: ["dress"] })[1]
        .fix,
    ).toBe(true);
  });

  it("not a service, not an alteration's own charge, and nothing more while one is out", () => {
    const pieces = alterableLines(lines, { offersAlterations: true, alterations: [alteration()] });
    expect(pieces.map((p) => p.line.id)).toEqual(["abaya", "dress"]);
    expect(pieces[0]).toMatchObject({ alteration: false, fix: false });
    expect(pieces[0].out?.id).toBe("a1");
  });

  it("in a store that does no alterations: a fix only", () => {
    const pieces = alterableLines(lines, { offersAlterations: false, alterations: [] });
    expect(pieces.map((p) => [p.line.id, p.alteration, p.fix])).toEqual([["abaya", false, true]]);
  });

  it("counts what is out, and what staff may do with each", () => {
    expect(
      alterationsOut([{ status: "at_workshop" }, { status: "back" }, { status: "open" }]),
    ).toBe(2);
    expect(alterationActions({ status: "at_workshop", made_by: "in_house" })).toEqual({
      back: true,
      handOver: false,
      cancel: true,
    });
    expect(alterationActions({ status: "at_workshop", made_by: "supplier" }).back).toBe(false);
    expect(alterationActions({ status: "back", made_by: "supplier" })).toEqual({
      back: false,
      handOver: true,
      cancel: false,
    });
  });
});

describe("where the customer pays", () => {
  it("on the order while it is open, on a new linked one once handed over", () => {
    expect(alterationTarget({ status: "confirmed", fulfillment_status: "PACKING" })).toBe(
      "same_order",
    );
    expect(alterationTarget({ status: "completed", fulfillment_status: "DELIVERED" })).toBe(
      "linked_order",
    );
    expect(alterationTarget({ fulfillment_status: "PICKED_UP" })).toBe("linked_order");
    expect(whereCharged("linked_order", "PL-01042", "en")).toBe(
      "On a new order linked to PL-01042, with its own invoice",
    );
    expect(whereCharged("same_order", "PL-01042", "ar")).toBe("يُضاف إلى هذا الطلب");
  });
});

describe("what changes", () => {
  const fields = measurementFields([
    { key: "length", label_en: "Length", label_ar: "الطول", value: "56" },
    { key: "sleeve", label_en: "Sleeve", label_ar: "الكم", value: 22 },
    { label_en: "No key" },
  ]);

  it("reads the line's measurements, and keeps only the ones changed", () => {
    expect(fields.map((f) => [f.key, f.value])).toEqual([
      ["length", "56"],
      ["sleeve", "22"],
    ]);
    expect(measurementChanges(fields, { length: " 54 ", sleeve: "22" })).toEqual([
      { key: "length", label_ar: "الطول", label_en: "Length", from: "56", to: "54" },
    ]);
  });

  it("is said in a few words, in each language", () => {
    const [change] = measurementChanges(fields, { length: "54" });
    expect(changeLine(change, "en")).toBe("Length: 56 → 54");
    expect(changeLine(change, "ar")).toBe("الطول: 56 → 54");
  });

  const form = (over: Partial<AlterForm> = {}): AlterForm => ({
    kind: "alteration",
    after: { length: "54" },
    note: "",
    madeBy: "supplier",
    vendorId: "v1",
    target: "new",
    dueAt: "2026-11-20",
    supplierCost: "3",
    customerCharge: "5",
    ...over,
  });

  it("needs a change, a supplier, the supplier's charge from finance staff and the customer's price", () => {
    expect(alterationProblems(form(), fields, { prices: true })).toEqual([]);
    expect(
      alterationProblems(
        form({ after: {}, vendorId: "", supplierCost: "", customerCharge: "1.2345" }),
        fields,
        { prices: true },
      ),
    ).toEqual(["vendor", "change", "supplier_cost", "customer_charge"]);
    // Order staff do not price the supplier's work; a fix has no price; our workshop no supplier.
    expect(alterationProblems(form({ supplierCost: "" }), fields, { prices: false })).toEqual([]);
    expect(
      alterationProblems(form({ kind: "fix", customerCharge: "" }), fields, { prices: true }),
    ).toEqual([]);
    expect(
      alterationProblems(form({ madeBy: "in_house", vendorId: "" }), fields, { prices: true }),
    ).toEqual([]);
  });

  it("asks the database for exactly what was chosen", () => {
    expect(
      alterationRequest(form({ note: " Take in the waist " }), fields, "abaya", "req", {
        prices: true,
      }),
    ).toEqual({
      p_source_item_id: "abaya",
      p_kind: "alteration",
      p_changes: [{ key: "length", label_ar: "الطول", label_en: "Length", from: "56", to: "54" }],
      p_note: "Take in the waist",
      p_made_by: "supplier",
      p_vendor_id: "v1",
      p_po_id: null,
      p_expected_at: "2026-11-20",
      p_supplier_cost: 3,
      p_customer_charge: 5,
      p_request_id: "req",
    });
    expect(
      alterationRequest(form({ kind: "fix", madeBy: "in_house" }), fields, "abaya", "req", {
        prices: false,
      }),
    ).toMatchObject({ p_vendor_id: null, p_supplier_cost: null, p_customer_charge: 0 });
  });

  it("words the database's refusals", () => {
    expect(alterationError("ERROR: ALTERATION_ALREADY_OUT", "en")).toMatch(/already out/);
    expect(alterationError("something else", "ar")).toBe("تعذّر الحفظ، حاول مرة أخرى.");
  });
});

describe("the messages", () => {
  it("to the supplier: what to do, with no price and no customer", () => {
    const message = alterationSupplierMessage({
      vendorName: "Umm Ali",
      storeName: "Pura",
      poNumber: "PO-0009",
      dueOn: "20/11/2026",
      piece: "Black abaya",
      kind: "alteration",
      changes: [{ label_en: "Length", from: "56", to: "54" }],
      note: "Keep the cuffs",
      lang: "en",
    });
    expect(message).toBe(
      [
        "Hello Umm Ali,",
        "A piece to alter for Pura (PO-0009, due 20/11/2026):",
        "Black abaya",
        "- Length: 56 → 54",
        "Keep the cuffs",
        "Thank you.",
      ].join("\n"),
    );
  });

  it("to the customer: received, and free when it is a fix", () => {
    expect(
      alterationReceivedMessage({
        isAr: false,
        brandName: "Pura",
        customerName: "Maryam",
        piece: "black abaya",
        kind: "fix",
        readyOn: "20/11/2026",
      }),
    ).toContain("to be fixed, at no charge to you.");
    expect(
      alterationReceivedMessage({
        isAr: true,
        brandName: "Pura",
        piece: "العباية",
        kind: "alteration",
      }),
    ).toContain("استلمنا العباية لتعديلها في Pura.");
  });
});

describe("the alteration's sheet", () => {
  const piece: JobSheetPiece = {
    title: "Black abaya",
    quantity: 1,
    imageUrl: null,
    options: [],
    details: [{ label: "Length", value: "56" }],
    notes: [],
    extras: [],
  };
  const base = {
    brand: "Pura",
    orderNumber: 1042,
    orderDate: "2026-11-01",
    alteration: {
      kind: "alteration" as const,
      changes: [{ label_en: "Length", label_ar: "الطول", from: "56", to: "54" }],
      note: "Keep the cuffs",
    },
  };

  it("says Alteration, and what to do above the piece as it was made", () => {
    const html = jobSheetHtml({ ...base, lang: "en", workshop: "Tailor", pieces: [piece] });
    expect(html).toContain("Alteration sheet #1042");
    expect(html.indexOf("Length: 56 → 54")).toBeLessThan(html.indexOf("Black abaya"));
    expect(html).toContain("Keep the cuffs");
    expect(html).not.toContain("Job sheet");
  });

  it("in both languages, each change in each", () => {
    const html = jobSheetHtml({
      ...base,
      alteration: { ...base.alteration, kind: "fix" },
      lang: "both",
      workshop: { ar: "الخيّاط", en: "Tailor" },
      pieces: { ar: [piece], en: [piece] },
    });
    expect(html).toContain("Fix sheet");
    expect(html).toContain("أمر تصليح");
    expect(html).toContain("Length: 56 → 54");
    expect(html).toContain("الطول: 56 → 54");
  });
});
