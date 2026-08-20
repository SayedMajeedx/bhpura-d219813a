import { describe, it, expect } from "vitest";
import {
  expandSizeRange,
  formatSkuToken,
  makeEan13,
  splitVariantValues,
  SIZING_PRESETS,
} from "../src/lib/variant-sku-utils";
import { extractVariantsHeuristically } from "../src/lib/generate-variants.functions";

describe("Variant Sizing Range Expansion", () => {
  it("expands Abaya even size range (50 to 60 زوجي)", () => {
    const result1 = expandSizeRange("من 50 إلى 60 زوجي");
    expect(result1).toEqual(["50", "52", "54", "56", "58", "60"]);

    const result2 = expandSizeRange("52-60 even");
    expect(result2).toEqual(["52", "54", "56", "58", "60"]);

    const result3 = expandSizeRange("مقاسات عبايات 50 إلى 58");
    expect(result3).toEqual(["50", "52", "54", "56", "58"]);
  });

  it("expands apparel letter ranges (XS to 2XL, S to XL)", () => {
    const result1 = expandSizeRange("XS to 2XL");
    expect(result1).toEqual(["XS", "S", "M", "L", "XL", "2XL"]);

    const result2 = expandSizeRange("من S إلى XL");
    expect(result2).toEqual(["S", "M", "L", "XL"]);

    const result3 = expandSizeRange("سمول إلى اكس لارج");
    expect(result3).toEqual(["S", "M", "L", "XL"]);
  });

  it("expands footwear numeric ranges (36-41)", () => {
    const result = expandSizeRange("36 to 41");
    expect(result).toEqual(["36", "37", "38", "39", "40", "41"]);
  });

  it("expands general numbered ranges (1 to 5)", () => {
    const result = expandSizeRange("من 1 إلى 5");
    expect(result).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("splits standard comma separated lists", () => {
    const result = expandSizeRange("S, M, L, XL");
    expect(result).toEqual(["S", "M", "L", "XL"]);
  });
});

describe("Smart SKU Transliteration & Formatting", () => {
  it("converts Arabic colors to standardized alphanumeric 3-letter SKU codes", () => {
    expect(formatSkuToken("أسود")).toBe("BLK");
    expect(formatSkuToken("اسود")).toBe("BLK");
    expect(formatSkuToken("أبيض")).toBe("WHT");
    expect(formatSkuToken("كحلي")).toBe("NVY");
    expect(formatSkuToken("عنابي")).toBe("BRG");
    expect(formatSkuToken("زيتي")).toBe("OLV");
    expect(formatSkuToken("بيج")).toBe("BEG");
    expect(formatSkuToken("سكري")).toBe("OFW");
    expect(formatSkuToken("رمادي")).toBe("GRY");
    expect(formatSkuToken("خردلي")).toBe("MST");
    expect(formatSkuToken("وردي")).toBe("PNK");
    expect(formatSkuToken("موف")).toBe("MAV");
    expect(formatSkuToken("تيفاني")).toBe("TIF");
    expect(formatSkuToken("لحمي")).toBe("NUD");
    expect(formatSkuToken("بترولي")).toBe("PET");
  });

  it("converts English colors to standardized 3-letter SKU codes", () => {
    expect(formatSkuToken("Black")).toBe("BLK");
    expect(formatSkuToken("Navy")).toBe("NVY");
    expect(formatSkuToken("Burgundy")).toBe("BRG");
    expect(formatSkuToken("Olive")).toBe("OLV");
    expect(formatSkuToken("Beige")).toBe("BEG");
    expect(formatSkuToken("Off-White")).toBe("OFW");
  });

  it("handles free size / one size aliases", () => {
    expect(formatSkuToken("Free Size")).toBe("OS");
    expect(formatSkuToken("One Size")).toBe("OS");
    expect(formatSkuToken("مقاس موحد")).toBe("OS");
  });
});

describe("EAN-13 Barcode Generation", () => {
  it("generates valid 13-digit barcodes with correct check digit", () => {
    const used = new Set<string>();
    const barcode = makeEan13(used);

    expect(barcode).toHaveLength(13);
    expect(barcode.startsWith("29")).toBe(true);
    expect(used.has(barcode)).toBe(true);

    // Verify EAN-13 checksum algorithm
    const body = barcode.slice(0, 12);
    const expectedCheck = Number(barcode[12]);
    const sum = body
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    const calculatedCheck = (10 - (sum % 10)) % 10;
    expect(calculatedCheck).toBe(expectedCheck);
  });

  it("avoids barcode collisions across multiple iterations", () => {
    const used = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      makeEan13(used);
    }
    expect(used.size).toBe(50);
  });
});

describe("Offline Heuristic & NLP Prompt Parser", () => {
  it("accurately extracts Gulf Arabic abaya prompt", () => {
    const prompt =
      "كود AB10، الألوان كحلي وعنابي وبيج، مقاسات العبايات من 52 إلى 60 زوجي، خامة كريب ملكي، السعر 25 د.ب والتخفيض 19.5 د.ب، المخزون 5 لكل مقاس";
    const result = extractVariantsHeuristically(prompt, "ar");

    expect(result.base_sku).toBe("AB10");
    expect(result.sizes).toEqual(["52", "54", "56", "58", "60"]);
    expect(result.colors).toContain("كحلي");
    expect(result.colors).toContain("عنابي");
    expect(result.colors).toContain("بيج");
    expect(result.fabric).toBe("كريب ملكي");
    expect(result.selling_price).toBe(19.5);
    expect(result.stock_main).toBe(5);
  });

  it("accurately extracts English boutique apparel prompt", () => {
    const prompt =
      "SKU DRS-99, colors Black, Olive and Burgundy, sizes S to XL, Fabric Linen, price 35, sale 29.5, main 10 incubator 2";
    const result = extractVariantsHeuristically(prompt, "en");

    expect(result.base_sku).toBe("DRS-99");
    expect(result.sizes).toEqual(["S", "M", "L", "XL"]);
    expect(result.colors).toContain("Black");
    expect(result.colors).toContain("Olive");
    expect(result.colors).toContain("Burgundy");
    expect(result.fabric).toBe("Linen");
    expect(result.selling_price).toBe(29.5);
    expect(result.stock_main).toBe(10);
    expect(result.stock_incubator).toBe(2);
  });

  it("respects product context when fields are omitted from prompt", () => {
    const prompt = "الألوان أسود وأبيض، المقاسات من 1 إلى 4";
    const result = extractVariantsHeuristically(prompt, "ar", {
      product_title: "فستان ناعم DRS-50",
      base_sku: "DRS-50",
      base_price: 45,
      cost_price: 18,
    });

    expect(result.base_sku).toBe("DRS-50");
    expect(result.sizes).toEqual(["1", "2", "3", "4"]);
    expect(result.colors).toContain("أسود");
    expect(result.colors).toContain("أبيض");
    expect(result.selling_price).toBe(45);
    expect(result.cost_price).toBe(18);
  });
});

describe("Sizing Quick Presets", () => {
  it("contains all GCC & standard boutique preset templates", () => {
    expect(SIZING_PRESETS.some((p) => p.id === "abaya_gulf")).toBe(true);
    expect(SIZING_PRESETS.some((p) => p.id === "apparel_standard")).toBe(true);
    expect(SIZING_PRESETS.some((p) => p.id === "shoes_women")).toBe(true);
    expect(SIZING_PRESETS.some((p) => p.id === "free_size")).toBe(true);
  });
});
