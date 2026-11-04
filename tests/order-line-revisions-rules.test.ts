import { describe, expect, it } from "vitest";
import {
  amendValues,
  changesSince,
  editableFields,
  LINE_REVISION_ERROR_CODES,
  lineFieldChanges,
  lineRevisionError,
  replacedSheetDate,
  revisionBanner,
  supplierBehind,
  type LineRevision,
} from "../src/features/orders/lib/line-revisions";
import { jobSheetHtml, jobSheetPieces } from "../src/features/orders/lib/job-sheet";
import { changeMessage } from "../src/features/supplier-orders/lib/supplier-message";

// Changing a custom order after it was placed (step 4 of docs/workshop-flow-plan.md): what the
// step offers and sends, when a supplier is behind, what changed since their sheet, the revised
// job sheet and the change message. The database's twin of `lineFieldChanges` is run against it
// in tests/order-line-revisions-migration.test.ts.

const PASSPORT = [
  { key: "fit_passport_profile", label_ar: "ملف المقاس", label_en: "Fit profile", value: "Abaya" },
  { key: "fit_passport_unit", label_ar: "وحدة القياس", label_en: "Length unit", value: "in" },
  { key: "fit_passport_abaya_length", label_ar: "الطول", label_en: "Length", value: "56" },
  { key: "fit_passport_abaya_bust", label_ar: "الصدر", label_en: "Bust", value: "22" },
];

const revision = (n: number, changes: LineRevision["changes"], at: string): LineRevision => ({
  id: `r${n}`,
  order_item_id: "l1",
  revision: n,
  changes,
  note: null,
  changed_by: null,
  changed_at: at,
  told_supplier_at: null,
});

describe("what the step offers and sends", () => {
  it("the line's answers, its product's other fields, and the notes for the workshop last", () => {
    const fields = editableFields(PASSPORT, [
      { key: "fit_passport_abaya_length", label_en: "Length" },
      { key: "sleeve_style", label_en: "Sleeves" },
    ]);
    expect(fields.map((f) => f.key)).toEqual([
      "fit_passport_abaya_length",
      "fit_passport_abaya_bust",
      "sleeve_style",
      "tailoring_notes",
    ]);
    // The notes the customer wrote stay the notes, with their own label.
    expect(
      editableFields([{ key: "tailoring_notes", label_en: "Notes", value: "Lined" }]).map((f) => [
        f.key,
        f.value,
      ]),
    ).toEqual([["tailoring_notes", "Lined"]]);
  });

  it("sends only what was changed, as typed", () => {
    const fields = editableFields(PASSPORT);
    expect(
      amendValues(fields, {
        fit_passport_abaya_length: "58",
        fit_passport_abaya_bust: " 22 ",
        tailoring_notes: "Full lining\nlonger",
      }),
    ).toEqual([
      { key: "fit_passport_abaya_length", value: "58" },
      { key: "tailoring_notes", value: "Full lining\nlonger" },
    ]);
    expect(amendValues(fields, {})).toEqual([]);
  });

  it("names what changed, as the database does", () => {
    expect(
      lineFieldChanges(PASSPORT, [
        PASSPORT[0],
        { ...PASSPORT[1], value: "cm" },
        { ...PASSPORT[2], value: "142" },
        PASSPORT[3],
      ]),
    ).toEqual([
      {
        key: "fit_passport_unit",
        label_ar: "وحدة القياس",
        label_en: "Length unit",
        from: "in",
        to: "cm",
      },
      {
        key: "fit_passport_abaya_length",
        label_ar: "الطول",
        label_en: "Length",
        from: "56",
        to: "142",
      },
    ]);
  });
});

describe("the supplier's sheet", () => {
  it("is behind while the line's revision is newer than the one they were given", () => {
    expect(supplierBehind(2, 1)).toBe(true);
    expect(supplierBehind(2, 2)).toBe(false);
    expect(supplierBehind(1, null)).toBe(false);
    expect(supplierBehind(null, null)).toBe(false);
  });

  it("is told what changed since it, one change per answer, from what they have", () => {
    const revisions = [
      revision(
        2,
        [{ key: "length", label_en: "Length", from: "56", to: "57" }],
        "2026-11-04T09:00:00Z",
      ),
      revision(
        3,
        [
          { key: "length", label_en: "Length", from: "57", to: "58" },
          { key: "bust", label_en: "Bust", from: "22", to: "23" },
        ],
        "2026-11-05T09:00:00Z",
      ),
      revision(
        4,
        [{ key: "bust", label_en: "Bust", from: "23", to: "22" }],
        "2026-11-06T09:00:00Z",
      ),
    ];
    // The supplier has the first sheet: length 56 → 58, and the bust is as it was.
    expect(changesSince(revisions, "l1", 1)).toEqual([
      { key: "length", label_en: "Length", from: "56", to: "58" },
    ]);
    // The supplier has revision 3: only the bust, back to 22.
    expect(changesSince(revisions, "l1", 3)).toEqual([
      { key: "bust", label_en: "Bust", from: "23", to: "22" },
    ]);
  });

  it("gets a message with the order, the piece and the changes, and nothing of the customer", () => {
    const text = changeMessage({
      vendorName: "Umm Ali",
      storeName: "Pura",
      poNumber: "PO-0007",
      title: "Black abaya",
      revision: 2,
      changes: [
        { key: "length", label_en: "Length", label_ar: "الطول", from: "56", to: "58" },
        { key: "tailoring_notes", label_en: "Notes for the workshop", from: "", to: "Full lining" },
      ],
      note: "Customer called",
      lang: "en",
    });
    expect(text).toContain("A change to Pura's order PO-0007, piece: Black abaya (revision 2):");
    expect(text).toContain("• Length: 56 → 58");
    expect(text).toContain("• Notes for the workshop: Full lining");
    expect(text).toContain("Note: Customer called");
    const ar = changeMessage({
      vendorName: "أم علي",
      storeName: "بيورا",
      poNumber: "PO-0007",
      title: "عباية سوداء",
      revision: 2,
      changes: [{ key: "length", label_en: "Length", label_ar: "الطول", from: "56", to: "58" }],
      lang: "ar",
    });
    expect(ar).toContain("• الطول: 56 → 58");
    expect(ar).toContain("(النسخة 2)");
  });
});

describe("the revised job sheet", () => {
  const line = {
    id: "l1",
    revision: 2,
    description: "Black abaya",
    quantity: 1,
    location: "custom",
    custom_field_values: [
      { ...PASSPORT[2], value: "58" },
      PASSPORT[3],
      {
        key: "tailoring_notes",
        label_en: "Notes for the workshop",
        label_ar: "ملاحظات",
        value: "Full lining",
      },
    ],
  };
  const revisions = [
    revision(
      2,
      [
        { key: "fit_passport_abaya_length", label_en: "Length", from: "56", to: "58" },
        { key: "tailoring_notes", label_en: "Notes", from: "", to: "Full lining" },
      ],
      "2026-11-04T09:00:00Z",
    ),
  ];

  it("says which revision it is, what it replaces, and marks what changed", () => {
    const [piece] = jobSheetPieces([line], [], {
      lang: "en",
      revisions,
      orderDate: "2026-11-01",
    });
    expect(piece.revision).toEqual({
      number: 2,
      replacesSheetOf: "2026-11-01",
      notesChanged: true,
    });
    expect(piece.details).toEqual([
      { label: "Length", value: "58", changed: true, was: "56" },
      { label: "Bust", value: "22" },
    ]);
    const html = jobSheetHtml({
      brand: "Pura",
      orderNumber: 1042,
      orderDate: "2026-11-01",
      lang: "en",
      workshop: "Tailor",
      pieces: [piece],
    });
    expect(html).toContain("Revision 2 — replaces the sheet of 11/01/2026");
    expect(html).toContain('<s class="was">56</s>');
    expect(html).toContain("(changed)");
  });

  it("a piece as it was placed has no banner", () => {
    const [piece] = jobSheetPieces([{ ...line, revision: 1 }], [], { lang: "en", revisions });
    expect(piece.revision).toBeNull();
    expect(piece.details.some((d) => d.changed)).toBe(false);
  });

  it("names the sheet a later revision replaces, in each language", () => {
    const more = [...revisions, revision(3, [], "2026-11-05T09:00:00Z")];
    expect(replacedSheetDate(more, 3, "2026-11-01")).toBe("2026-11-04T09:00:00Z");
    expect(replacedSheetDate(more, 2, "2026-11-01")).toBe("2026-11-01");
    expect(revisionBanner(2, "2026-11-01", "ar")).toMatch(
      /^النسخة 2 — تحلّ محلّ ورقة 01\S*11\S*2026$/,
    );
    expect(revisionBanner(2, null, "en")).toBe("Revision 2");
  });
});

describe("the database's refusals", () => {
  it("are read in the reader's language, never as a bare code", () => {
    for (const code of LINE_REVISION_ERROR_CODES) {
      for (const lang of ["ar", "en"] as const) {
        const said = lineRevisionError({ message: code }, lang);
        expect(said).not.toContain(code);
        expect(said.length).toBeGreaterThan(5);
      }
    }
    expect(lineRevisionError({ message: "PIECE_ALREADY_ARRIVED" }, "en")).toContain("alteration");
    expect(lineRevisionError(new Error("boom"), "en")).toBe(
      "Could not save the change. Try again.",
    );
  });
});
