import { describe, expect, it } from "vitest";
import { stockUnitsLabel, variantCountLabel } from "../src/lib/inventory-labels";

describe("inventory labels", () => {
  it("uses natural Arabic option counts", () => {
    expect(variantCountLabel(0, "ar")).toBe("لا توجد خيارات");
    expect(variantCountLabel(1, "ar")).toBe("خيار واحد");
    expect(variantCountLabel(2, "ar")).toBe("خياران");
    expect(variantCountLabel(4, "ar")).toBe("4 خيارات");
  });

  it("makes stock badge numbers explicitly about units", () => {
    expect(stockUnitsLabel(1, "low", "ar")).toBe("وحدة واحدة متبقية");
    expect(stockUnitsLabel(2, "available", "ar")).toBe("وحدتان متوفرتان");
    expect(stockUnitsLabel(3, "low", "ar")).toBe("3 وحدات متبقية");
    expect(stockUnitsLabel(9, "available", "en")).toBe("9 units available");
  });
});
