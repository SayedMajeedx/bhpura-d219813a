import { describe, expect, it } from "vitest";
import { arNoun, arNounOblique, countOf } from "../src/lib/arabic-count";

// The admin wrote "6 عملية بيع", "1 مهام معلّقة", "7 طلب" and "5 تقييم" (found 2026-10-24).

describe("arNoun", () => {
  it("counts a noun as Arabic counts it", () => {
    expect(arNoun(0, "order")).toBe("0 طلب");
    expect(arNoun(1, "order")).toBe("طلب واحد");
    expect(arNoun(2, "order")).toBe("طلبان");
    expect(arNoun(7, "order")).toBe("7 طلبات");
    expect(arNoun(10, "order")).toBe("10 طلبات");
    expect(arNoun(11, "order")).toBe("11 طلبًا");
    expect(arNoun(99, "order")).toBe("99 طلبًا");
    expect(arNoun(100, "order")).toBe("100 طلب");
    expect(arNoun(102, "order")).toBe("102 طلب");
    expect(arNoun(105, "order")).toBe("105 طلبات");
    expect(arNoun(150, "order")).toBe("150 طلبًا");
  });

  it("knows a feminine noun and a two-word one", () => {
    expect(arNoun(1, "task")).toBe("مهمة واحدة");
    expect(arNoun(6, "sale")).toBe("6 عمليات بيع");
    expect(arNoun(2, "sale")).toBe("عمليتا بيع");
    expect(arNoun(14, "piece")).toBe("14 قطعة");
  });
});

describe("countOf", () => {
  it("speaks the reader's language", () => {
    expect(countOf(19, "product", "ar")).toBe("19 منتجًا");
    expect(countOf(1, "product", "en")).toBe("1 product");
    expect(countOf(19, "product", "en")).toBe("19 products");
    expect(countOf(3, "category", "en")).toBe("3 categories");
  });
});

describe("arNounOblique", () => {
  it("puts two in the oblique after a word that governs it, and leaves the rest as they are", () => {
    // The transfer button read "تحويل قطعتان".
    expect(`تحويل ${arNounOblique(2, "piece")}`).toBe("تحويل قطعتين");
    expect(`تم حذف ${arNounOblique(2, "product")}`).toBe("تم حذف منتجين");
    expect(arNounOblique(2, "sale")).toBe("عمليتي بيع");
    expect(arNounOblique(2, "paidBooking")).toBe("حجزين مدفوعين");
    expect(arNounOblique(1, "piece")).toBe("قطعة واحدة");
    expect(arNounOblique(5, "piece")).toBe("5 قطع");
    expect(arNounOblique(12, "product")).toBe("12 منتجًا");
    expect(arNounOblique(0, "order")).toBe("0 طلب");
  });
});
