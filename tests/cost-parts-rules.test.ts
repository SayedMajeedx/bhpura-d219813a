import { describe, expect, it } from "vitest";
import {
  margin,
  partProblems,
  partsChanged,
  partsToSave,
  partsTotal,
  rowsFrom,
  storedParts,
  type CostPartRow,
} from "../src/features/inventory/lib/cost-parts";
import {
  costsToSave,
  entryCost,
  missingCostProducts,
} from "../src/features/inventory/lib/missing-costs";

const row = (label: string, amount: string, key = label || amount || "blank"): CostPartRow => ({
  key,
  label,
  amount,
});

describe("a cost in parts", () => {
  it("reads only well-formed parts, and none as one number", () => {
    expect(storedParts([{ label: "Material", amount: 8.5 }, { label: 3 }, null])).toEqual([
      { label: "Material", amount: 8.5 },
    ]);
    expect(storedParts([])).toBeNull();
    expect(storedParts(null)).toBeNull();
    expect(rowsFrom(null)).toBeNull();
    expect(rowsFrom([{ label: "Making", amount: 12 }])?.[0]).toMatchObject({
      label: "Making",
      amount: "12",
    });
  });

  it("adds up to the fils, a part not yet typed counting as nothing", () => {
    expect(partsTotal([row("Material", "8.5"), row("Making", "12.25"), row("Extras", "")])).toBe(
      20.75,
    );
    expect(partsTotal([row("a", "0.1"), row("b", "0.2")])).toBe(0.3);
  });

  it("asks a name and an amount of each part it keeps, and drops empty ones", () => {
    const rows = [row("Material", "8"), row("", "3", "noname"), row("Making", "-1"), row("", "")];
    expect([...partProblems(rows)]).toEqual(["noname", "Making"]);
    expect(partsToSave([row("Material", "8.1234"), row("", "")])).toEqual([
      { label: "Material", amount: 8.123 },
    ]);
    expect(partsToSave([row("", "")])).toBeNull();
    expect(partsToSave(null)).toBeNull();
  });

  it("is written only when it changed", () => {
    const saved = [{ label: "Material", amount: 8 }];
    expect(partsChanged(saved, [{ label: "Material", amount: 8 }])).toBe(false);
    expect(partsChanged(saved, [{ label: "Material", amount: 9 }])).toBe(true);
    expect(partsChanged(null, null)).toBe(false);
    expect(partsChanged(saved, null)).toBe(true);
  });

  it("says what a sale leaves", () => {
    expect(margin(30, 21.25)).toEqual({ amount: 8.75, percent: 29 });
    expect(margin(20, 25)).toEqual({ amount: -5, percent: -25 });
    expect(margin(0, 5)).toBeNull();
  });
});

describe("the missing-costs sheet", () => {
  const product = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: id,
    name_ar: null,
    name_en: id,
    image_url: null,
    cost_price: 0,
    ...over,
  });

  it("lists products with no cost, made-to-order first, never a service or one with a cost", () => {
    const list = missingCostProducts(
      [
        product("Scarf"),
        product("Abaya", { is_made_to_order: true }),
        product("Henna", { item_kind: "service" }),
        product("Bag", { cost_price: 9 }),
        product("Dress", { is_made_to_order: true }),
      ],
      { Scarf: [{ cost_price: 0 }], Bag: [{ cost_price: 0 }] },
      "en",
    );
    expect(list.map((p) => p.id)).toEqual(["Abaya", "Dress", "Scarf"]);
  });

  it("saves what was typed, skips what was left empty, and holds back a bad amount", () => {
    expect(
      costsToSave({
        a: { amount: "12.5", parts: null },
        b: { amount: "", parts: null },
        c: { amount: "0", parts: null },
        d: { amount: "", parts: [row("Material", "8"), row("Making", "4")] },
        e: { amount: "-3", parts: null },
        f: { amount: "", parts: [row("", "2", "x")] },
      }),
    ).toEqual({
      save: [
        { productId: "a", cost: { amount: 12.5 } },
        {
          productId: "d",
          cost: {
            parts: [
              { label: "Material", amount: 8 },
              { label: "Making", amount: 4 },
            ],
          },
        },
      ],
      invalid: ["e", "f"],
    });
    expect(entryCost({ amount: "", parts: [row("Material", "8"), row("Making", "4")] })).toBe(12);
    expect(entryCost({ amount: "", parts: null })).toBeNull();
  });
});
