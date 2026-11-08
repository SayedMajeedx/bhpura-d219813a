import { describe, expect, it } from "vitest";
import {
  NO_EDITS,
  applyBulk,
  cellNumber,
  cellText,
  editCell,
  editVisible,
  editsAfterSave,
  sheetChanges,
  sheetProblems,
  sheetRows,
  sheetSavePlan,
  type SheetRow,
} from "../src/features/inventory/lib/bulk-sheet";
import type { Product, Variant } from "../src/features/inventory/types";

// The inventory's sheet: every size of the listed products in one table, changed many at a time,
// reviewed, then saved through the same writes as the product editor (stock through the ledger).

const product = (id: string, extra: Partial<Product> = {}) =>
  ({
    id,
    name: `P ${id}`,
    name_ar: `منتج ${id}`,
    name_en: `Product ${id}`,
    image_url: `https://img/${id}.jpg`,
    is_active: true,
    item_kind: "product",
    ...extra,
  }) as Product;

const variant = (id: string, extra: Partial<Variant> = {}) =>
  ({
    id,
    sku: `SKU-${id}`,
    size: null,
    color: null,
    fabric: null,
    option_four: null,
    option_five: null,
    selling_price: 20,
    original_price: null,
    stock_main: 3,
    stock_incubator: 0,
    cost_price: 8,
    image_url: null,
    ...extra,
  }) as unknown as Variant;

const axisDefaults = {} as never;

function rowsOf(
  products: Product[],
  variants: Record<string, Variant[]>,
  costsKnown = true,
): SheetRow[] {
  return sheetRows({
    products,
    variantsByProduct: variants,
    axisDefaults,
    lang: "en",
    costsKnown,
  });
}

describe("the sheet's rows", () => {
  const rows = rowsOf(
    [
      product("a"),
      product("svc", { item_kind: "service" }),
      product("pkg", { is_package: true }),
      product("mto", { is_made_to_order: true }),
    ],
    {
      a: [
        variant("a54", { size: "54", selling_price: 22, original_price: 30 }),
        variant("a56", { size: "56" }),
      ],
      svc: [variant("s1")],
      pkg: [variant("k1")],
      mto: [variant("m1", { stock_main: 0 })],
    },
  );

  it("lists each size of each product, leaving services and packages to their editors", () => {
    expect(rows.map((r) => r.variantId)).toEqual(["a54", "a56", "m1"]);
    expect(rows[0]).toMatchObject({
      productName: "Product a",
      price: 22,
      wasPrice: 30,
      stock: 3,
      cost: 8,
      firstOfProduct: true,
    });
    expect(rows[1].firstOfProduct).toBe(false);
    expect(rows[1].wasPrice).toBeNull();
  });

  it("names a size by its options, and a product with none as having none", () => {
    expect(rows[0].options).toContain("54");
    expect(rows[2].options).toBe("No options");
  });

  it("has nothing to count on a made-to-order product's only size with no ready piece", () => {
    expect(rows[2].stockEditable).toBe(false);
    expect(rows[0].stockEditable).toBe(true);
  });

  it("shows no cost to a reader who may not see costs", () => {
    expect(rowsOf([product("a")], { a: [variant("a1")] }, false)[0].cost).toBeNull();
  });
});

describe("bulk actions on chosen rows", () => {
  const rows = rowsOf([product("a")], {
    a: [
      variant("v1", { selling_price: 20 }),
      variant("v2", { selling_price: 30, original_price: 40 }),
      variant("v3", { selling_price: 10 }),
    ],
  });
  const chosen = new Set(["v1", "v2"]);

  it("raises prices by a percentage, to the currency's decimals, on chosen rows only", () => {
    const edits = applyBulk(rows, chosen, { kind: "change_price", percent: 7.5 }, NO_EDITS, 3);
    expect(cellText(rows[0], "price", edits)).toBe("21.5");
    expect(cellText(rows[1], "price", edits)).toBe("32.25");
    expect(cellText(rows[2], "price", edits)).toBe("10");
  });

  it("puts sizes on sale off their regular price, striking it through", () => {
    const edits = applyBulk(rows, chosen, { kind: "sale", percent: 25 }, NO_EDITS, 3);
    expect([cellText(rows[0], "price", edits), cellText(rows[0], "wasPrice", edits)]).toEqual([
      "15",
      "20",
    ]);
    // Already on sale: 25% off its regular price of 40, not off 30.
    expect([cellText(rows[1], "price", edits), cellText(rows[1], "wasPrice", edits)]).toEqual([
      "30",
      "40",
    ]);
  });

  it("ends a sale by putting the regular price back", () => {
    const edits = applyBulk(rows, new Set(["v2"]), { kind: "end_sale" }, NO_EDITS, 3);
    expect([cellText(rows[1], "price", edits), cellText(rows[1], "wasPrice", edits)]).toEqual([
      "40",
      "",
    ]);
  });

  it("drops a was price a new price reaches", () => {
    const edits = applyBulk(rows, new Set(["v2"]), { kind: "set_price", value: 45 }, NO_EDITS, 3);
    expect(cellText(rows[1], "wasPrice", edits)).toBe("");
  });

  it("sets stock only where there is something to count", () => {
    const withMto = rowsOf([product("m", { is_made_to_order: true })], {
      m: [variant("m1", { stock_main: 0 })],
    });
    const edits = applyBulk(withMto, new Set(["m1"]), { kind: "set_stock", value: 4 }, NO_EDITS, 3);
    expect(edits.cells.m1).toBeUndefined();
  });
});

describe("what stops a save", () => {
  const rows = rowsOf([product("a")], { a: [variant("v1", { selling_price: 20 })] });

  it("asks for numbers, whole stock, sane sizes and a was price above the price", () => {
    let edits = editCell(NO_EDITS, "v1", "price", "abc");
    expect(sheetProblems(rows, edits).v1).toEqual({ price: "not_a_number" });
    edits = editCell(NO_EDITS, "v1", "stock", "2.5");
    expect(sheetProblems(rows, edits).v1).toEqual({ stock: "not_whole" });
    edits = editCell(NO_EDITS, "v1", "price", "1000000");
    expect(sheetProblems(rows, edits).v1).toEqual({ price: "too_big" });
    edits = editCell(NO_EDITS, "v1", "wasPrice", "15");
    expect(sheetProblems(rows, edits).v1).toEqual({ wasPrice: "was_not_higher" });
    edits = editCell(NO_EDITS, "v1", "price", "");
    expect(sheetProblems(rows, edits).v1).toEqual({ price: "not_a_number" });
  });

  it("takes an empty was price as off sale, and reads Arabic digits", () => {
    expect(sheetProblems(rows, editCell(NO_EDITS, "v1", "wasPrice", ""))).toEqual({});
    expect(cellNumber("٢٥٫٥")).toBe(25.5);
    expect(cellNumber(" 12 ")).toBe(12);
    expect(cellNumber("")).toBeNull();
  });
});

describe("the review and the save", () => {
  const rows = rowsOf([product("a"), product("b", { is_active: false })], {
    a: [variant("v1", { selling_price: 20, cost_price: 8 }), variant("v2")],
    b: [variant("v3", { selling_price: 12, original_price: 15 })],
  });

  it("lists only what really changed, and turns it into the writes that save it", () => {
    let edits = editCell(NO_EDITS, "v1", "price", "18.000");
    edits = editCell(edits, "v1", "cost", "9");
    edits = editCell(edits, "v2", "price", "20"); // the same as before: not a change
    edits = editCell(edits, "v2", "stock", "7");
    edits = editCell(edits, "v3", "wasPrice", "");
    edits = editVisible(edits, "b", true);
    const changes = sheetChanges(rows, edits, 3);
    expect(changes.map((c) => [c.row.variantId, c.field, c.from, c.to])).toEqual([
      ["v1", "price", 20, 18],
      ["v1", "cost", 8, 9],
      ["v2", "stock", 3, 7],
      ["v3", "wasPrice", 15, null],
      ["v3", "visible", false, true],
    ]);
    expect(sheetSavePlan(changes)).toEqual({
      variants: [
        { variantId: "v1", patch: { selling_price: 18, cost_price: 9 } },
        { variantId: "v3", patch: { original_price: null } },
      ],
      stock: [{ variantId: "v2", value: 7 }],
      show: ["b"],
      hide: [],
    });
  });

  it("never sends a cost for a reader who may not see costs", () => {
    const noCosts = rowsOf([product("a")], { a: [variant("v1")] }, false);
    const changes = sheetChanges(noCosts, editCell(NO_EDITS, "v1", "cost", "99"), 3);
    expect(changes).toEqual([]);
  });

  it("keeps the edits that failed to save, and only those", () => {
    let edits = editCell(NO_EDITS, "v1", "price", "18");
    edits = editCell(edits, "v2", "stock", "7");
    edits = editVisible(edits, "b", true);
    expect(editsAfterSave(edits, new Set(["v2"]))).toEqual({
      cells: { v2: { stock: "7" } },
      visible: {},
    });
  });
});
