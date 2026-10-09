import { describe, expect, it } from "vitest";
import {
  categoryPathParam,
  parseCategoryPath,
} from "../src/features/storefront-home/lib/category-path";

describe("the home page's category path in the address", () => {
  it("is empty without a value, so the logo's plain link shows the whole home page", () => {
    expect(parseCategoryPath(undefined)).toEqual([]);
    expect(parseCategoryPath("")).toEqual([]);
    expect(parseCategoryPath(42)).toEqual([]);
    expect(categoryPathParam([])).toBeUndefined();
  });

  it("reads a category and its sub-categories in order", () => {
    expect(parseCategoryPath("abayas")).toEqual(["abayas"]);
    expect(parseCategoryPath("abayas,evening")).toEqual(["abayas", "evening"]);
  });

  it("round-trips slugs with Arabic letters, spaces and commas", () => {
    for (const path of [["عبايات يومية"], ["a b", "c,d"], ["عبايات مناسبات", "سهرة"]]) {
      const param = categoryPathParam(path);
      expect(parseCategoryPath(param)).toEqual(path);
    }
  });

  it("ignores empty parts and a broken escape", () => {
    expect(parseCategoryPath("a,,b,")).toEqual(["a", "b"]);
    expect(parseCategoryPath("%E0%A4%A")).toEqual(["%E0%A4%A"]);
  });
});
