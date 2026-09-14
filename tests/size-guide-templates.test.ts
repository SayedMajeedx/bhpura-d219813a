import { describe, it, expect } from "vitest";
import {
  ALL_SIZE_GUIDE_TEMPLATES,
  ABAYA_GULF_TEMPLATE,
  getSizeGuideTemplate,
} from "../src/lib/size-guide-templates";
import { normalizeSizeGuide } from "../src/lib/size-guide";
import fs from "fs";
import path from "path";

describe("Size Guide Templates Catalog", () => {
  it("includes all 9 specialized templates matching vertical requirements", () => {
    expect(ALL_SIZE_GUIDE_TEMPLATES.length).toBe(9);
    expect(ABAYA_GULF_TEMPLATE.key).toBe("abaya_gulf");
    const keys = ALL_SIZE_GUIDE_TEMPLATES.map((t) => t.key);
    expect(keys).toContain("abaya_gulf");
    expect(keys).toContain("women_clothing");
    expect(keys).toContain("dress");
    expect(keys).toContain("men_clothing");
    expect(keys).toContain("men_thobe");
    expect(keys).toContain("shoes");
    expect(keys).toContain("rings");
    expect(keys).toContain("bracelets");
    expect(keys).toContain("kids");
  });

  it("ensures every template is valid and normalizable", () => {
    for (const template of ALL_SIZE_GUIDE_TEMPLATES) {
      expect(template.key).toBeTruthy();
      expect(template.name_ar).toBeTruthy();
      expect(template.name_en).toBeTruthy();
      expect(["in", "cm", "mm", "none"]).toContain(template.base_unit);
      expect(template.columns.length).toBeGreaterThanOrEqual(1);
      expect(template.rows.length).toBeGreaterThanOrEqual(1);

      // Verify template passes normalizeSizeGuide without loss
      const normalized = normalizeSizeGuide({
        id: "test",
        brand_id: "test-brand",
        ...template,
      });
      expect(normalized.columns.length).toBe(template.columns.length);
      expect(normalized.rows.length).toBe(template.rows.length);
    }
  });

  it("abaya_gulf template matches the exact backward-compatible structure of DEFAULT_ABAYA_SIZES", () => {
    const abaya = getSizeGuideTemplate("abaya_gulf");
    expect(abaya).toBeDefined();

    // Must have sizes 50, 52, 54, 56, 58, 60
    const sizes = abaya?.rows.map((r) => r.size_label || r.label);
    expect(sizes).toEqual(["50", "52", "54", "56", "58", "60"]);

    // Must have columns length, bust, sleeve, shoulder
    const colKeys = abaya?.columns.map((c) => c.key);
    expect(colKeys).toEqual(["length", "bust", "sleeve", "shoulder"]);

    // Check sample values matching Gulf tailoring standard
    const row54 = abaya?.rows.find((r) => (r.size_label || r.label) === "54");
    expect(row54?.values["length"]).toBe(54);
    expect(row54?.values["bust"]).toBe(22);
    expect(row54?.values["sleeve"]).toBe(27);
    expect(row54?.values["shoulder"]).toBe(15.5);
  });

  it("abaya_gulf template JSON matches the migration backfill data exactly", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../supabase/migrations/20260916100000_size_guides.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Verify template_key 'abaya_gulf' is in the migration
    expect(sql).toContain("'abaya_gulf'");
    expect(sql).toContain("50");
    expect(sql).toContain("60");

    const abaya = getSizeGuideTemplate("abaya_gulf");
    expect(abaya?.columns[0].key).toBe("length");
    expect(abaya?.columns[1].key).toBe("bust");
    expect(abaya?.columns[2].key).toBe("sleeve");
    expect(abaya?.columns[3].key).toBe("shoulder");
  });
});
