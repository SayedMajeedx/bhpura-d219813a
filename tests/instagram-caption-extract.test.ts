import { describe, expect, it } from "vitest";
import {
  extractPriceByRegex,
  extractSizes,
  normalizeNumerals,
  readPrice,
} from "../src/features/instagram-import/lib/caption-extract";

// What a store's caption says, read without the AI: the price (and an old crossed-out one), its
// currency, and the sizes. Conservative: an unclear caption gives nothing, never a guess.

describe("normalizeNumerals", () => {
  it("turns Arabic-Indic and Persian digits and separators into plain numbers", () => {
    expect(normalizeNumerals("٢٨ و ۳۵")).toBe("28 و 35");
    expect(normalizeNumerals("٣٥٫٥٠٠")).toBe("35.500");
  });

  it("reads 35,500 as a decimal (fils) and 1,250,000-style thousands as one number", () => {
    expect(normalizeNumerals("35,500")).toBe("35.500");
    expect(normalizeNumerals("9,5")).toBe("9.5");
    expect(normalizeNumerals("123,456")).toBe("123456");
    expect(normalizeNumerals("12,500 BD")).toBe("12.500 BD");
  });
});

describe("readPrice: a price stated in the caption", () => {
  const price = (caption: string) => readPrice(caption).price;

  it("reads the usual ways a store writes it", () => {
    expect(price("عباية مرجان\nالسعر 28 د.ب")).toBe(28);
    expect(price("السعر: 35.500 BD")).toBe(35.5);
    expect(price("Price: 35 BHD")).toBe(35);
    expect(price("٢٨ دينار بحريني")).toBe(28);
    expect(price("28د.ب فقط")).toBe(28);
    expect(price("BD 35")).toBe(35);
    expect(price("دينار 35")).toBe(35);
    expect(price("بسعر 42 دب")).toBe(42);
    expect(price("السعر 28")).toBe(28);
  });

  it("reads a decimal comma and fils written as thousands", () => {
    expect(price("35,500 BD")).toBe(35.5);
    expect(price("35000 د.ب")).toBe(35);
    expect(price("12,5 د.ب")).toBe(12.5);
  });

  it("is not fooled by sizes, phone numbers or an absurd amount", () => {
    expect(price("المقاس 52 متوفر")).toBeNull();
    expect(price("للطلب واتساب 39001122")).toBeNull();
    expect(price("99999 د.ب")).toBeNull();
    expect(price("")).toBeNull();
    expect(price(undefined)).toBeNull();
  });

  it("does not take a delivery fee or a discount amount for the price", () => {
    expect(price("السعر 30 د.ب\nالتوصيل 2 د.ب")).toBe(30);
    expect(price("رسوم التوصيل: 2 د.ب")).toBeNull();
    expect(price("Delivery 2 BD, price 30 BD")).toBe(30);
    expect(price("السعر 25 د.ب خصم 5 د.ب")).toBe(25);
    expect(price("خصم 5 د.ب")).toBeNull();
  });
});

describe("readPrice: a price that was reduced", () => {
  it("takes the new price and keeps the old one crossed out", () => {
    expect(readPrice("كان 40 د.ب الآن 30 د.ب")).toMatchObject({ price: 30, originalPrice: 40 });
    expect(readPrice("السعر 30 د.ب بدل 40 د.ب")).toMatchObject({ price: 30, originalPrice: 40 });
    expect(readPrice("Was 40 BD now 30 BD")).toMatchObject({ price: 30, originalPrice: 40 });
    expect(readPrice("عرض 22 د.ب بدلاً من 30 د.ب")).toMatchObject({ price: 22, originalPrice: 30 });
  });

  it("has no old price when there is none, or when it is not above the price", () => {
    expect(readPrice("السعر 30 د.ب").originalPrice).toBeNull();
    expect(readPrice("30 د.ب بدل 20 د.ب").originalPrice).toBeNull();
  });

  it("gives no price when only an old price is stated", () => {
    expect(readPrice("كان 40 د.ب").price).toBeNull();
  });
});

describe("readPrice: several prices", () => {
  it("lists them and gives none when the caption does not say which is the price", () => {
    const reading = readPrice("45 د.ب أو 30 د.ب");
    expect(reading.price).toBeNull();
    expect(reading.ambiguous).toEqual([30, 45]);
  });

  it("prefers the one with a price word, and counts the same price written twice once", () => {
    expect(readPrice("السعر 30 د.ب\nقطعة ثانية 45 د.ب").price).toBe(30);
    expect(readPrice("السعر 30 د.ب\n30 BD").price).toBe(30);
  });
});

describe("readPrice: currency", () => {
  const currency = (caption: string) => readPrice(caption).currency;

  it("names the currency the caption uses", () => {
    expect(currency("28 د.ب")).toBe("BHD");
    expect(currency("35 BD")).toBe("BHD");
    expect(currency("100 ريال سعودي")).toBe("SAR");
    expect(currency("100 SAR")).toBe("SAR");
    expect(currency("50 AED")).toBe("AED");
    expect(currency("120 درهم")).toBe("AED");
    expect(currency("25 KD")).toBe("KWD");
    expect(currency("25 دينار كويتي")).toBe("KWD");
    expect(currency("30 ريال عماني")).toBe("OMR");
    expect(currency("30 ريال قطري")).toBe("QAR");
  });

  it("leaves a bare riyal or price word without a currency, and reads the price anyway", () => {
    expect(readPrice("30 ريال")).toMatchObject({ price: 30, currency: null });
    expect(readPrice("السعر 28")).toMatchObject({ price: 28, currency: null });
  });

  it("allows bigger amounts in currencies that are not dinars", () => {
    expect(readPrice("1500 ريال سعودي").price).toBe(1500);
    expect(readPrice("2500 د.ب").price).toBeNull();
  });
});

describe("extractPriceByRegex (kept for callers of the old function)", () => {
  it("gives the price, the text it came from and that it was stated outright", () => {
    expect(extractPriceByRegex("السعر 28 د.ب")).toMatchObject({ price: 28, isExplicit: true });
    expect(extractPriceByRegex("no price here")).toEqual({
      price: null,
      rawMatch: null,
      isExplicit: false,
    });
  });
});

describe("extractSizes", () => {
  it("reads a size line", () => {
    expect(extractSizes("المقاسات: 52 54 56")).toEqual(["52", "54", "56"]);
    expect(extractSizes("المقاسات المتوفرة 52, 54، 56")).toEqual(["52", "54", "56"]);
    expect(extractSizes("المقاسات: ٥٢ ٥٤")).toEqual(["52", "54"]);
    expect(extractSizes("Sizes: S M L")).toEqual(["S", "M", "L"]);
  });

  it("expands a range", () => {
    expect(extractSizes("المقاسات 50-58")).toEqual(["50", "52", "54", "56", "58"]);
    expect(extractSizes("مقاس 52 الى 56")).toEqual(["52", "54", "56"]);
    expect(extractSizes("Sizes S-XL")).toEqual(["S", "M", "L", "XL"]);
    expect(extractSizes("المقاسات 41-44")).toEqual(["41", "42", "43", "44"]);
  });

  it("reads free size, and three or more letter sizes in a row without a label", () => {
    expect(extractSizes("فري سايز")).toEqual(["Free Size"]);
    expect(extractSizes("One Size fits all")).toEqual(["Free Size"]);
    expect(extractSizes("عباية جديدة\nS M L XL")).toEqual(["S", "M", "L", "XL"]);
  });

  it("never takes a price, a phone number or a date for a size", () => {
    expect(extractSizes("السعر 52 د.ب\nواتساب 39001122")).toEqual([]);
    expect(extractSizes("وصلت 12/10/2026")).toEqual([]);
    expect(extractSizes("M")).toEqual([]);
    expect(extractSizes("نص بدون مقاسات")).toEqual([]);
    expect(extractSizes("")).toEqual([]);
    expect(extractSizes(null)).toEqual([]);
  });

  it("keeps only plausible numbers after a label, and each size once", () => {
    expect(extractSizes("المقاس 52 والسعر 28")).toEqual(["52"]);
    expect(extractSizes("مقاسات 54 56 مع السعر 56 د.ب")).toEqual(["54", "56"]);
  });
});
