import { describe, expect, it } from "vitest";
import { customFieldLabel, customFieldValue } from "../src/lib/order-custom-fields";

// Order lines written from the admin before 2026-10-24 carry "Passport — " before every
// measurement; the order page, the invoice, the job sheet and the label read the name alone.

const old = {
  key: "fit_passport_abaya_length",
  label_ar: "Passport — الطول",
  label_en: "Passport — Length",
  value: "56 in",
};

describe("an order line's answered field", () => {
  it("reads without the old passport prefix, in the reader's language", () => {
    expect(customFieldLabel(old, "ar")).toBe("الطول");
    expect(customFieldLabel(old, "en")).toBe("Length");
    expect(customFieldLabel({ ...old, label_en: "Fit Passport – Sleeve" }, "en")).toBe("Sleeve");
  });

  it("keeps a store's own label, falls back to the other language, then to the key", () => {
    expect(customFieldLabel({ key: "k", label_ar: "", label_en: "Name on the box" }, "ar")).toBe(
      "Name on the box",
    );
    expect(customFieldLabel({ key: "gift_note" }, "en")).toBe("gift_note");
    expect(customFieldLabel({ key: "k", label_en: "Passport number" }, "en")).toBe(
      "Passport number",
    );
  });

  it("writes a measurement's unit in Arabic words, and leaves other answers as typed", () => {
    expect(customFieldValue(old, "ar")).toBe("56 إنش");
    expect(customFieldValue({ ...old, value: "142 cm" }, "ar")).toBe("142 سم");
    expect(customFieldValue(old, "en")).toBe("56 in");
    expect(customFieldValue({ key: "note", value: "made in" }, "ar")).toBe("made in");
    expect(customFieldValue({ key: "note", value: "Size 2 in red" }, "ar")).toBe("Size 2 in red");
    expect(customFieldValue({ key: "chest", value: "38.5 in" }, "ar")).toBe("38.5 إنش");
  });
});
