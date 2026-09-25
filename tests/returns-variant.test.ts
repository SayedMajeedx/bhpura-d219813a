import { describe, expect, it } from "vitest";
import { returnVariantLabel } from "../src/lib/returns-variant";

describe("returnVariantLabel", () => {
  it("names a variant by its option values", () => {
    expect(returnVariantLabel({ size: "54", sku: "ABAYA-54" }, "en")).toBe("54");
    expect(returnVariantLabel({ size: "M", color: "Black", sku: "X" }, "en")).toContain(" / ");
  });

  it("falls back to the SKU when the variant has no options", () => {
    expect(returnVariantLabel({ sku: "ABAYA-ONE" }, "en")).toBe("ABAYA-ONE");
  });

  it("returns null when there is nothing to show, so each screen keeps its own fallback", () => {
    expect(returnVariantLabel({ sku: "  " }, "en")).toBeNull();
    expect(returnVariantLabel(null, "ar")).toBeNull();
    expect(returnVariantLabel(undefined, "en")).toBeNull();
  });
});
