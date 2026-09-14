import { describe, it, expect } from "vitest";
import {
  convertMeasurement,
  formatCell,
  resolveSizeGuideForProduct,
  parseSizeGuidePaste,
  normalizeSizeGuide,
  type SizeGuide,
} from "../src/addons/size-guides/lib/size-guide";

describe("Size Guide Pure Library", () => {
  describe("convertMeasurement", () => {
    it("converts cm to inches accurately", () => {
      // 50.8 cm = 20 inches
      expect(convertMeasurement(50.8, "cm", "in")).toBe(20);
      expect(convertMeasurement(2.54, "cm", "in")).toBe(1);
    });

    it("converts inches to cm accurately", () => {
      // 20 inches = 50.8 cm
      expect(convertMeasurement(20, "in", "cm")).toBe(50.8);
      expect(convertMeasurement(1, "in", "cm")).toBe(2.5);
    });

    it("returns same value when units match", () => {
      expect(convertMeasurement(56, "in", "in")).toBe(56);
      expect(convertMeasurement(140, "cm", "cm")).toBe(140);
    });

    it("converts range values correctly", () => {
      const rangeInches = { min: 20, max: 22 };
      const rangeCm = convertMeasurement(rangeInches, "in", "cm");
      expect(rangeCm).toEqual({ min: 50.8, max: 55.9 });
    });
  });

  describe("formatCell", () => {
    it("formats single numeric values", () => {
      expect(formatCell(54, "in", "in")).toBe("54");
      expect(formatCell(54, "in", "cm")).toBe("137.2");
    });

    it("formats range values", () => {
      expect(formatCell({ min: 20, max: 22 }, "in", "in")).toBe("20–22");
      expect(formatCell({ min: 20, max: 22 }, "in", "cm")).toBe("50.8–55.9");
    });

    it("formats string or empty values", () => {
      expect(formatCell("Free Size", "in", "in")).toBe("Free Size");
      expect(formatCell(undefined, "in", "in")).toBe("—");
      expect(formatCell(null as any, "in", "in")).toBe("—");
    });
  });

  describe("resolveSizeGuideForProduct", () => {
    const mockDefaultGuide: SizeGuide = {
      id: "guide-default",
      brand_id: "brand-1",
      name_ar: "دليل المتجر الافتراضي",
      name_en: "Default Guide",
      template_key: "abaya_gulf",
      base_unit: "in",
      columns: [{ key: "size", label_ar: "المقاس", label_en: "Size", kind: "size_label" }],
      rows: [{ size_label: "56", values: {} }],
      how_to_measure: [],
      diagram_url: null,
      video_url: null,
      recommender_enabled: true,
      placement: "both",
      notes_ar: null,
      notes_en: null,
      is_default: true,
      is_active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };

    const mockProductGuide: SizeGuide = {
      ...mockDefaultGuide,
      id: "guide-product",
      name_en: "Product Specific Guide",
      is_default: false,
    };

    const mockCategoryGuide: SizeGuide = {
      ...mockDefaultGuide,
      id: "guide-category",
      name_en: "Category Specific Guide",
      is_default: false,
    };

    const allGuides = [mockDefaultGuide, mockProductGuide, mockCategoryGuide];

    it("resolves product-level override first", () => {
      const product = {
        id: "prod-1",
        size_guide_id: "guide-product",
        size_guide_hidden: false,
      };
      const result = resolveSizeGuideForProduct({ product, sizeGuides: allGuides });
      expect(result?.id).toBe("guide-product");
    });

    it("returns null if product has size_guide_hidden === true", () => {
      const product = {
        id: "prod-1",
        size_guide_id: "guide-product",
        size_guide_hidden: true,
      };
      const result = resolveSizeGuideForProduct({ product, sizeGuides: allGuides });
      expect(result).toBeNull();
    });

    it("resolves category guide when product has no direct guide", () => {
      const product = {
        id: "prod-1",
        size_guide_id: null,
        size_guide_hidden: false,
        category: "Abayas",
      };
      const categories = [{ id: "cat-1", name_en: "Abayas", size_guide_id: "guide-category" }];
      const result = resolveSizeGuideForProduct({
        product,
        categories,
        sizeGuides: allGuides,
      });
      expect(result?.id).toBe("guide-category");
    });

    it("falls back to brand default guide when neither product nor category has override", () => {
      const product = {
        id: "prod-1",
        size_guide_id: null,
        size_guide_hidden: false,
      };
      const result = resolveSizeGuideForProduct({ product, sizeGuides: allGuides });
      expect(result?.id).toBe("guide-default");
    });

    it("returns null if no guides exist or match", () => {
      const product = { id: "prod-1" };
      const result = resolveSizeGuideForProduct({ product, sizeGuides: [] });
      expect(result).toBeNull();
    });
  });

  describe("parseSizeGuidePaste", () => {
    it("parses tab-separated spreadsheet data correctly", () => {
      const tsvData = `Size\tLength\tBust\tSleeve\n52\t52\t20\t26\n54\t54\t21\t27\n56\t56\t22\t28`;
      const result = parseSizeGuidePaste(tsvData, "in");

      expect(result).not.toBeNull();
      expect(result?.columns.length).toBe(4);
      expect(result?.columns[0].kind).toBe("size_label");
      expect(result?.columns[1].measurement_key).toBe("length");
      expect(result?.columns[2].measurement_key).toBe("bust");
      expect(result?.columns[3].measurement_key).toBe("sleeve");

      expect(result?.rows.length).toBe(3);
      expect(result?.rows[0].size_label).toBe("52");
      expect(result?.rows[0].values["length"]).toBe(52);
      expect(result?.rows[0].values["bust"]).toBe(20);
    });

    it("parses range cells (e.g. 20-22)", () => {
      const tsvData = `Size\tBust\nS\t32-34\nM\t35-37`;
      const result = parseSizeGuidePaste(tsvData, "in");

      expect(result).not.toBeNull();
      expect(result?.rows[0].values["bust"]).toEqual({ min: 32, max: 34 });
      expect(result?.rows[1].values["bust"]).toEqual({ min: 35, max: 37 });
    });

    it("returns null on empty or single line text", () => {
      expect(parseSizeGuidePaste("", "in")).toBeNull();
      expect(parseSizeGuidePaste("Size\tLength", "in")).toBeNull();
    });
  });

  describe("normalizeSizeGuide", () => {
    it("provides clean defaults for malformed or null fields", () => {
      const raw = {
        id: "g1",
        brand_id: "b1",
        name_ar: "دليل",
        name_en: "Guide",
        columns: null,
        rows: null,
        how_to_measure: null,
      };

      const normalized = normalizeSizeGuide(raw);
      expect(Array.isArray(normalized.columns)).toBe(true);
      expect(Array.isArray(normalized.rows)).toBe(true);
      expect(Array.isArray(normalized.how_to_measure)).toBe(true);
      expect(normalized.placement).toBe("both");
      expect(normalized.recommender_enabled).toBe(true);
      expect(normalized.base_unit).toBe("in");
    });
  });
});
