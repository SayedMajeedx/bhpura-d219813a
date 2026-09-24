import { describe, expect, it } from "vitest";
import {
  decideSalePrice,
  marginBand,
  marginPercent,
  saleInputValue,
  stockRunRate,
} from "../src/features/inventory/lib/variant-metrics";
import {
  attributeDraftFrom,
  normalizeAttributeDraft,
} from "../src/features/inventory/lib/variant-attributes";

describe("margin", () => {
  it("is a percentage of the selling price", () => {
    expect(marginPercent(20, 5)).toBe(75);
    expect(marginPercent(0, 5)).toBe(0);
  });

  it("bands at 20% and 50%", () => {
    expect(marginBand(19.9)).toBe("low");
    expect(marginBand(20)).toBe("medium");
    expect(marginBand(49.9)).toBe("medium");
    expect(marginBand(50)).toBe("healthy");
  });
});

describe("sale price", () => {
  it("shows the current sale price only when the variant is on sale", () => {
    expect(saleInputValue({ original_price: 30, selling_price: 25 })).toBe("25");
    expect(saleInputValue({ original_price: null, selling_price: 25 })).toBe("");
    expect(saleInputValue({ original_price: 25, selling_price: 25 })).toBe("");
  });

  it("clears the sale for empty, zero or the regular price", () => {
    expect(decideSalePrice("", 30)).toEqual({ kind: "clear", sellingPrice: 30 });
    expect(decideSalePrice("0", 30)).toEqual({ kind: "clear", sellingPrice: 30 });
    expect(decideSalePrice("30", 30)).toEqual({ kind: "clear", sellingPrice: 30 });
  });

  it("rejects a sale above the regular price or a non-number", () => {
    expect(decideSalePrice("31", 30)).toEqual({ kind: "invalid" });
    expect(decideSalePrice("abc", 30)).toEqual({ kind: "invalid" });
    expect(decideSalePrice("-1", 30)).toEqual({ kind: "invalid" });
  });

  it("accepts a lower sale price", () => {
    expect(decideSalePrice("24.5", 30)).toEqual({ kind: "sale", sellingPrice: 24.5 });
  });
});

describe("stock run rate", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it("is out when no stock is left in either location", () => {
    expect(
      stockRunRate({ stockMain: 0, stockIncubator: 0, qtySold: 5, createdAt: null, now }),
    ).toEqual({ kind: "out" });
  });

  it("reports no sales when nothing sold", () => {
    expect(
      stockRunRate({ stockMain: 4, stockIncubator: null, qtySold: 0, createdAt: daysAgo(3), now }),
    ).toEqual({ kind: "no-sales" });
  });

  it("averages sales over the variant's age", () => {
    // 10 sold over 10 days = 1/day; 7 in stock -> 7 days left.
    expect(
      stockRunRate({ stockMain: 5, stockIncubator: 2, qtySold: 10, createdAt: daysAgo(10), now }),
    ).toEqual({ kind: "days-left", days: 7 });
  });

  it("caps the averaging window at 45 days (and uses 45 when the age is unknown)", () => {
    const expected = { kind: "days-left", days: 45 };
    expect(
      stockRunRate({ stockMain: 1, stockIncubator: 0, qtySold: 1, createdAt: daysAgo(400), now }),
    ).toEqual(expected);
    expect(
      stockRunRate({ stockMain: 1, stockIncubator: 0, qtySold: 1, createdAt: null, now }),
    ).toEqual(expected);
  });
});

describe("variant attribute draft", () => {
  const variant = {
    size: "M",
    size_unit: null,
    color: null,
    fabric: "Crepe",
    option_four: null,
    option_five: null,
  };

  it("round-trips a variant through the editor draft", () => {
    const draft = attributeDraftFrom(variant);
    expect(draft).toEqual({
      size: "M",
      sizeUnit: "",
      color: "",
      fabric: "Crepe",
      optionFour: "",
      optionFive: "",
    });
    expect(normalizeAttributeDraft(draft)).toEqual({
      size: "M",
      size_unit: null,
      color: null,
      fabric: "Crepe",
      option_four: null,
      option_five: null,
    });
  });

  it("splits a composite size into size, unit and option when no colour is set", () => {
    const patch = normalizeAttributeDraft({
      ...attributeDraftFrom(variant),
      size: "700 g - classic",
    });
    expect(patch).toMatchObject({ size: "700", size_unit: "g", color: "classic" });
  });

  it("keeps a composite size as typed when a colour is already set", () => {
    const patch = normalizeAttributeDraft({
      ...attributeDraftFrom(variant),
      size: "700 g - classic",
      color: "Black",
    });
    expect(patch).toMatchObject({ size: "700 g - classic", color: "Black" });
  });
});
