import { describe, it, expect } from "vitest";
import { recommendSize } from "../src/lib/size-guide";
import { ABAYA_GULF_TEMPLATE } from "../src/lib/size-guide-templates";

describe("Size Recommender Algorithm", () => {
  const guide = {
    id: "gulf-abaya-test",
    brand_id: "brand-test",
    name_ar: ABAYA_GULF_TEMPLATE.name_ar,
    name_en: ABAYA_GULF_TEMPLATE.name_en,
    template_key: ABAYA_GULF_TEMPLATE.key,
    base_unit: ABAYA_GULF_TEMPLATE.base_unit, // "in"
    columns: ABAYA_GULF_TEMPLATE.columns,
    rows: ABAYA_GULF_TEMPLATE.rows,
    how_to_measure: ABAYA_GULF_TEMPLATE.how_to_measure,
    diagram_url: null,
    video_url: null,
    recommender_enabled: true,
    placement: "both" as const,
    notes_ar: null,
    notes_en: null,
    is_default: true,
    is_active: true,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };

  it("recommends exact matching size for Gulf Abaya (length 54 in, bust 22 in)", () => {
    const recommendation = recommendSize({
      guide,
      userMeasurements: {
        length: 54,
        bust: 22,
      },
      inputUnit: "in",
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.size).toBe("54");
    expect(recommendation?.confidence).toBe("high");
    expect(recommendation?.confidenceScore).toBeGreaterThanOrEqual(90);
  });

  it("recommends matching size when inputs are in centimeters (137 cm ~ 54 in)", () => {
    // 54 inches * 2.54 = 137.16 cm
    const recommendation = recommendSize({
      guide,
      userMeasurements: {
        length: 137,
      },
      inputUnit: "cm",
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.size).toBe("54");
    expect(recommendation?.confidence).toBe("high");
  });

  it("handles between-sizes appropriately (length 55 in -> recommends 56 or 54 with note)", () => {
    const recommendation = recommendSize({
      guide,
      userMeasurements: {
        length: 55,
      },
      inputUnit: "in",
    });

    expect(recommendation).not.toBeNull();
    // 55 is between 54 and 56
    expect(["54", "56"]).toContain(recommendation?.size);
  });

  it("returns null or lowest confidence when no measurements provided", () => {
    const recommendation = recommendSize({
      guide,
      userMeasurements: {},
      inputUnit: "in",
    });

    expect(recommendation).toBeNull();
  });

  it("calculates between-sizes when user measurements span adjacent rows", () => {
    // Length fits 52 (52), but bust fits 56 (23)
    const recommendation = recommendSize({
      guide,
      userMeasurements: {
        length: 52,
        bust: 23,
      },
      inputUnit: "in",
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.size).toBeDefined();
    // When measurements clash, confidence should be lower than high
    expect(recommendation?.confidenceScore).toBeLessThan(95);
  });
});
