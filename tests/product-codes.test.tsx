import { describe, expect, it } from "vitest";
import {
  codeAssignError,
  codePlan,
  codePlanProblem,
  codeUnreadable,
  inStoreStyle,
  sizesNeedingCodes,
  type NumberingVariant,
} from "../src/features/inventory/lib/code-numbering";

// Numbering a store's size codes (the owner's request of 2026-11-18): Pura's run is 40xx, one
// number per size, as its own codes and the codes written at its partner shop. The owner chose:
// keep the run with no prefix, renumber the other styles to match it, adopt the partner's number
// where a piece carries one, and give barcodes to sizes without.

const products = [
  { id: "athar", name: "Abaya | Athar", name_ar: "عباية | أثر" },
  { id: "tayf", name: "Inner Dress | Tayf", name_ar: "فستان | طَيف" },
  { id: "tie", name: "Abaya | Tie", name_ar: "عباية | ربطة" },
];
const v = (
  id: string,
  product: string,
  sku: string | null,
  size: string | null,
  extra: Partial<NumberingVariant> = {},
): NumberingVariant => ({
  id,
  product_id: product,
  sku,
  barcode: null,
  size,
  color: null,
  ...extra,
});

const variants = [
  v("athar-54", "athar", null, "54"),
  v("athar-53", "athar", null, "53"),
  v("tayf-53", "tayf", "S77-بني-53", "53", { color: "بني" }),
  v("tayf-56", "tayf", "PL1-BLK", "56"),
  v("tie-52", "tie", "4039", "52", { barcode: "2900000000017" }),
];
const partnerCodes = [
  { variant_id: "athar-53", external_code: "4044" },
  { variant_id: "tayf-53", external_code: "4016" },
];
let counter = 0;
const makeBarcode = () => `29000000000${String(++counter).padStart(2, "0")}`;
const plan = (overrides: Partial<Parameters<typeof codePlan>[0]> = {}) =>
  codePlan({
    variants,
    products,
    partnerCodes,
    prefix: "",
    nextNumber: 4049,
    withBarcodes: false,
    restyle: true,
    makeBarcode,
    lang: "en",
    ...overrides,
  });

describe("which codes change", () => {
  it("keeps the store's own numbers and reads the rest as needing a code", () => {
    expect(inStoreStyle("4039", "")).toBe(true);
    expect(inStoreStyle("PL-4039", "PL-")).toBe(true);
    expect(inStoreStyle("S79-56", "")).toBe(false);
    expect(codeUnreadable("S77-كحلي-50")).toBe(true);
    expect(codeUnreadable("ٌPRD1-BEG-54")).toBe(true);
    expect(codeUnreadable("PL1-BLK")).toBe(false);
    expect(sizesNeedingCodes(variants)).toBe(3);
  });

  it("adopts the partner's number, then numbers the rest by product and size from the next", () => {
    const rows = plan();
    expect(rows.map((row) => [row.variantId, row.proposed, row.source])).toEqual([
      ["athar-53", "4044", "partner"],
      ["athar-54", "4049", "number"],
      ["tayf-53", "4016", "partner"],
      ["tayf-56", "4050", "number"],
    ]);
    // The store's own number stays as it is.
    expect(rows.find((row) => row.variantId === "tie-52")).toBeUndefined();
  });

  it("leaves a readable code in another style alone when not asked to restyle it", () => {
    expect(plan({ restyle: false }).map((row) => row.variantId)).not.toContain("tayf-56");
  });

  it("never takes a number already used, nor a partner's code another size has", () => {
    const rows = plan({
      nextNumber: 4039,
      partnerCodes: [{ variant_id: "athar-53", external_code: "4039" }],
    });
    expect(rows.map((row) => row.proposed)).toEqual(["4040", "4041", "4042", "4043"]);
  });

  it("gives a new barcode to each changed size with none", () => {
    counter = 0;
    const rows = plan({ withBarcodes: true });
    expect(rows.every((row) => /^29\d{11}$/.test(row.barcode ?? ""))).toBe(true);
  });
});

describe("what stops a save", () => {
  it("is an unreadable code or one used twice", () => {
    const rows = plan();
    expect(codePlanProblem(rows, ["4039"], "en")).toBeNull();
    expect(codePlanProblem([{ ...rows[0], proposed: "4039" }], ["4039"], "en")).toMatch(
      /4039 is used twice/,
    );
    expect(codePlanProblem([{ ...rows[0], proposed: "كود" }], [], "ar")).toMatch(/حروفاً إنجليزية/);
  });

  it("is said with the piece the database stopped on", () => {
    const rows = plan();
    expect(codeAssignError("CODE_TAKEN:athar-54", rows, "en")).toBe(
      "Abaya | Athar · 54: the code 4049 is used by another size",
    );
    expect(codeAssignError("something else", rows, "en")).toBeNull();
  });
});
