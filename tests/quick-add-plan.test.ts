import { describe, expect, it } from "vitest";
import {
  chosenChoice,
  pickOption,
  valueFits,
  choiceLabel,
  isMeasurementField,
  quickAddPlan,
  type QuickAddProduct,
  type QuickAddVariant,
} from "../src/features/product-page/lib/quick-add";

const at = new Date("2026-11-01T10:00:00Z");
const v = (id: string, size: string | null, stock: number, extra: Partial<QuickAddVariant> = {}) =>
  ({
    id,
    size,
    size_unit: null,
    color: null,
    fabric: null,
    stock_main: stock,
    stock_incubator: 0,
    ...extra,
  }) as QuickAddVariant;

// Pura's abaya: made to order, measurements asked, ready sizes in stock.
const abaya: QuickAddProduct = {
  is_made_to_order: true,
  custom_fields: [
    { key: "fit_length", required: true },
    { key: "fit_bust", required: true },
    { key: "notes", required: false },
  ],
};
const ready: QuickAddProduct = { is_made_to_order: false, custom_fields: [] };
const mto = { madeToOrderModule: true, at };
const ids = (plan: ReturnType<typeof quickAddPlan>) =>
  plan.kind === "add" ? plan.choices.map((c) => c.id) : [];

describe("quickAddPlan: what a card can add without the product page", () => {
  it("a ready piece with one size in stock is one button that adds it", () => {
    const plan = quickAddPlan(ready, [v("a", "M", 2)], mto);
    expect(plan).toMatchObject({ kind: "add", tailored: undefined, tailorToo: false });
    expect(ids(plan)).toEqual(["a"]);
  });

  it("several sizes are offered in the order a shopper reads them, sold-out ones left out", () => {
    const plan = quickAddPlan(ready, [v("56", "56", 1), v("54", "54", 3), v("52", "52", 0)], mto);
    expect(ids(plan)).toEqual(["54", "56"]);
  });

  it("numbers rise first, then words keep the store's order", () => {
    const plan = quickAddPlan(
      ready,
      [v("l", "L", 1), v("58", "58", 1), v("s", "S", 1), v("50", "50", 1)],
      mto,
    );
    expect(ids(plan)).toEqual(["50", "58", "l", "s"]);
  });

  it("a made-to-order piece's ready sizes go in as ready, with tailoring offered beside them", () => {
    const plan = quickAddPlan(abaya, [v("54", "54", 1), v("56", "56", 0)], mto);
    expect(plan).toMatchObject({ kind: "add", tailored: false, tailorToo: true });
    expect(ids(plan)).toEqual(["54"]);
  });

  it("a made-to-order piece whose ready sizes are all sold out opens the page on tailoring", () => {
    expect(quickAddPlan(abaya, [v("54", "54", 0)], mto)).toEqual({
      kind: "page",
      reason: "tailor",
    });
  });

  it("made to order with no ready size at all (the placeholder) is tailored on the page", () => {
    expect(quickAddPlan(abaya, [v("std", "قياسي", 0)], mto)).toEqual({
      kind: "page",
      reason: "tailor",
    });
  });

  it("without the store's made-to-order module the piece is tailored on the page, as the page sells it", () => {
    expect(quickAddPlan(abaya, [v("54", "54", 2)], { madeToOrderModule: false, at })).toEqual({
      kind: "page",
      reason: "tailor",
    });
  });

  it("a made-to-order piece asking only for details (no measurements) opens the page for them", () => {
    const engraving: QuickAddProduct = {
      is_made_to_order: true,
      custom_fields: [{ key: "engraving", required: true }],
    };
    expect(quickAddPlan(engraving, [], mto)).toEqual({ kind: "page", reason: "details" });
  });

  it("a used-up or paused limit sells the ready sizes only, with no tailoring", () => {
    const closed = { ...abaya, made_to_order_available: 0 };
    const paused = { ...abaya, made_to_order_paused_at: "2026-10-30T00:00:00Z" };
    for (const product of [closed, paused]) {
      const plan = quickAddPlan(product, [v("54", "54", 1)], mto);
      expect(plan).toMatchObject({ kind: "add", tailored: false, tailorToo: false });
    }
    expect(quickAddPlan(closed, [v("54", "54", 0)], mto)).toEqual({ kind: "none" });
  });

  it("a ready piece that asks the shopper for a required detail opens the page", () => {
    const gift: QuickAddProduct = {
      is_made_to_order: false,
      custom_fields: [{ key: "gift_message", required: true }],
    };
    expect(quickAddPlan(gift, [v("a", "M", 4)], mto)).toEqual({ kind: "page", reason: "details" });
    const optional = { ...gift, custom_fields: [{ key: "gift_message", required: false }] };
    expect(quickAddPlan(optional, [v("a", "M", 4)], mto).kind).toBe("add");
  });

  it("a service is booked on its page, never put in the bag", () => {
    expect(quickAddPlan({ item_kind: "service" }, [v("a", null, 0)], mto)).toEqual({
      kind: "page",
      reason: "book",
    });
  });

  it("nothing is offered while the product is off sale or sold out", () => {
    expect(
      quickAddPlan({ ...ready, unavailable_until: "2026-11-02T00:00:00Z" }, [v("a", "M", 3)], mto),
    ).toEqual({ kind: "none" });
    expect(quickAddPlan(ready, [v("a", "M", 0)], mto)).toEqual({ kind: "none" });
    expect(quickAddPlan(ready, [], mto)).toEqual({ kind: "none" });
  });

  it("partner stock counts as a piece that can be added", () => {
    const plan = quickAddPlan(ready, [v("a", "M", 0, { stock_incubator: 2 })], mto);
    expect(ids(plan)).toEqual(["a"]);
  });

  it("the placeholder size is offered only when it is all there is", () => {
    expect(ids(quickAddPlan(ready, [v("std", "Standard", 5)], mto))).toEqual(["std"]);
    expect(ids(quickAddPlan(ready, [v("std", "Standard", 5), v("m", "M", 1)], mto))).toEqual(["m"]);
  });
});

describe("choiceLabel", () => {
  it("names the size and what else the piece differs by", () => {
    expect(choiceLabel(v("a", "54", 1), "ar")).toBe("54");
    expect(choiceLabel(v("a", "55", 1, { color: "Black" }), "en")).toBe("55 · Black");
  });

  it("names nothing for the placeholder size", () => {
    expect(choiceLabel(v("a", "قياسي", 1), "ar")).toBeNull();
  });
});

describe("isMeasurementField", () => {
  it("reads the page's measurement keys", () => {
    expect(isMeasurementField("fit_length")).toBe(true);
    expect(isMeasurementField("custom_measurements")).toBe(true);
    expect(isMeasurementField("fit_passport")).toBe(true);
    expect(isMeasurementField("engraving")).toBe(false);
  });
});

describe("picking among the pieces", () => {
  const pieces = [
    v("b55", "55", 1, { color: "Black" }),
    v("p54", "54", 1, { color: "Purple" }),
    v("p56", "56", 1, { color: "Purple" }),
  ];

  it("names a piece only once every option with more than one value is picked", () => {
    expect(chosenChoice(pieces, ["size", "color"], {})).toBeNull();
    expect(chosenChoice(pieces, ["size", "color"], { color: "Purple" })).toBeNull();
    expect(chosenChoice(pieces, ["size", "color"], { color: "purple", size: "56" })?.id).toBe(
      "p56",
    );
    expect(chosenChoice([pieces[0]], ["size"], {})?.id).toBe("b55");
  });

  it("lets go of a pick no piece has with the new one", () => {
    expect(pickOption(pieces, { size: "55" }, "color", "Purple")).toEqual({ color: "Purple" });
    expect(pickOption(pieces, { size: "54" }, "color", "Purple")).toEqual({
      color: "Purple",
      size: "54",
    });
  });

  it("dims a value no piece has with the other picks", () => {
    expect(valueFits(pieces, { color: "Purple" }, "size", "55")).toBe(false);
    expect(valueFits(pieces, { color: "Purple" }, "size", "54")).toBe(true);
    expect(valueFits(pieces, { color: "Purple" }, "color", "Black")).toBe(true);
  });
});
