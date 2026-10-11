import { describe, expect, it } from "vitest";
import {
  isWorkshopLine,
  jobSheetHtml,
  jobSheetPieces,
  type JobSheetLine,
  type JobSheetProduct,
} from "../src/features/orders/lib/job-sheet";

// The page that goes to the workshop with a made-to-order piece: which lines are on it, what it
// says about each, and what it must never say (money, how to reach the customer).

const ABAYA: JobSheetProduct = {
  id: "p-abaya",
  item_kind: "product",
  image_url: "https://cdn.example/abaya.jpg",
};
const PHOTO_BOOTH: JobSheetProduct = { id: "p-booth", item_kind: "service" };

/** A made-to-order line as the storefront stores it. */
const tailored: JobSheetLine = {
  product_id: "p-abaya",
  variant_id: "v1",
  description: "Blush Floral Abaya",
  quantity: 2,
  location: "custom",
  customizations: [{ name: "Inner dress" }],
  selected_variant: { size: null, color: "Black", fabric: "" },
  custom_field_values: [
    { key: "length", label_ar: "الطول", label_en: "Length", value: "56 in" },
    { key: "bust", label_ar: "محيط الصدر", label_en: "Bust", value: "40 in" },
    { key: "sleeve", label_ar: "طول الكم", label_en: "Sleeve Length", value: "  " },
    { key: "tailoring_notes", label_ar: "ملاحظات", label_en: "Notes", value: " shorter sleeves " },
  ],
};
const ready: JobSheetLine = {
  product_id: "p-abaya",
  variant_id: "v2",
  description: "Ready Abaya",
  quantity: 1,
  location: "main",
  selected_variant: { size: "54", color: "Black" },
  custom_field_values: [],
};

const pieces = (lines: JobSheetLine[], lang: "ar" | "en" = "en") =>
  jobSheetPieces(lines, [ABAYA, PHOTO_BOOTH], { lang });

describe("which lines go to the workshop", () => {
  it("a line the database marked made to order", () => {
    expect(isWorkshopLine({ ...ready, location: "custom" }, ABAYA)).toBe(true);
  });

  it("a custom piece staff added by hand", () => {
    expect(isWorkshopLine({ description: "Custom", quantity: 1, variant_id: "custom" })).toBe(true);
  });

  it("a ready piece the customer gave instructions for", () => {
    const engraved = { ...ready, custom_field_values: [{ key: "engraving", value: "S.M" }] };
    expect(isWorkshopLine(engraved, ABAYA)).toBe(true);
  });

  it("not a ready piece taken from stock, even with empty fields", () => {
    expect(isWorkshopLine(ready, ABAYA)).toBe(false);
    expect(
      isWorkshopLine({ ...ready, custom_field_values: [{ key: "x", value: " " }] }, ABAYA),
    ).toBe(false);
  });

  it("never a service, though its line is marked custom", () => {
    const booth = { product_id: "p-booth", description: "Photo booth", quantity: 1 };
    expect(isWorkshopLine({ ...booth, location: "custom" }, PHOTO_BOOTH)).toBe(false);
    expect(pieces([{ ...booth, location: "custom" }])).toEqual([]);
  });
});

describe("what the sheet says about a piece", () => {
  it("lists only the pieces to make, in order", () => {
    expect(pieces([ready, tailored]).map((p) => p.title)).toEqual(["Blush Floral Abaya"]);
  });

  it("reads the piece, its quantity, its picture, its options and its extras", () => {
    const [piece] = pieces([tailored]);
    expect(piece).toMatchObject({
      title: "Blush Floral Abaya",
      quantity: 2,
      imageUrl: "https://cdn.example/abaya.jpg",
      extras: ["Inner dress"],
    });
    expect(piece.options.map((o) => o.value)).toEqual(["Black"]);
  });

  it("separates the measurements from what the customer wrote", () => {
    const [piece] = pieces([tailored]);
    expect(piece.details).toEqual([
      { label: "Length", value: "56 in" },
      { label: "Bust", value: "40 in" },
    ]);
    expect(piece.notes).toEqual(["shorter sleeves"]);
  });

  it("labels the measurements in the language of the sheet", () => {
    expect(pieces([tailored], "ar")[0].details.map((d) => d.label)).toEqual([
      "الطول",
      "محيط الصدر",
    ]);
  });

  it("falls back to the other language, then the field's key", () => {
    const line: JobSheetLine = {
      ...tailored,
      custom_field_values: [
        { key: "hem", label_ar: "الذيل", label_en: null, value: "wide" },
        { key: "cuff", value: "narrow" },
      ],
    };
    expect(pieces([line])[0].details).toEqual([
      { label: "الذيل", value: "wide" },
      { label: "cuff", value: "narrow" },
    ]);
  });

  it("does not show the placeholder size of a piece with no sizes", () => {
    const line = { ...tailored, selected_variant: { size: "Standard", color: null } };
    expect(pieces([line])[0].options).toEqual([]);
  });

  it("copes with a line that has no product and nothing chosen", () => {
    const [piece] = pieces([{ description: " ", quantity: 0, variant_id: "custom" }]);
    expect(piece).toMatchObject({
      title: "—",
      quantity: 1,
      imageUrl: null,
      details: [],
      notes: [],
    });
  });
});

describe("the printed page", () => {
  const page = (lang: "ar" | "en" = "en", overrides = {}) =>
    jobSheetHtml({
      brand: "ZH Abayas",
      workshop: lang === "ar" ? "الورشة" : "Tailor",
      orderNumber: 1042,
      orderDate: "2026-10-11",
      customerName: "Fatima",
      orderNote: "Needed before Eid",
      pieces: pieces([tailored, { ...tailored, description: "Second piece" }], lang),
      lang,
      ...overrides,
    });

  it("says who it is for and which order it belongs to", () => {
    const html = page();
    expect(html).toContain("Job sheet #1042");
    expect(html).toContain("For: Tailor");
    expect(html).toContain("ZH Abayas");
    expect(html).toContain("Fatima");
    expect(html).toContain("Needed before Eid");
  });

  it("gives every piece its measurements, notes and a count", () => {
    const html = page();
    expect(html).toContain("Piece 1 of 2");
    expect(html).toContain("Piece 2 of 2");
    expect(html).toContain("Second piece");
    expect(html).toContain("56 in");
    expect(html).toContain("shorter sleeves");
    expect(html).toContain("Inner dress");
    expect(html).toContain("Tailor notes");
  });

  it("reads right to left in Arabic, in the store's own word for the workshop", () => {
    const html = page("ar");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("أمر تشغيل #1042");
    expect(html).toContain("إلى: الورشة");
    expect(html).toContain("القطعة 1 من 2");
    expect(html).toContain("محيط الصدر");
  });

  it("carries no money and no way to reach the customer", () => {
    const html = page();
    expect(html).not.toMatch(/BHD|د\.ب|price|total|phone|address/i);
  });

  it("escapes what a customer typed", () => {
    const line = {
      ...tailored,
      description: `Abaya "A" <b>`,
      custom_field_values: [{ key: "tailoring_notes", value: "<script>alert(1)</script>" }],
    };
    const html = page("en", {
      customerName: "<img src=x>",
      pieces: pieces([line]),
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Abaya &quot;A&quot; &lt;b&gt;");
    expect(html).not.toContain("<img src=x>");
  });

  it("leaves out the order note when there is none", () => {
    expect(page("en", { orderNote: "  " })).not.toContain("Order note");
  });
});
