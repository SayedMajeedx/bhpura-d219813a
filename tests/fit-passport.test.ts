import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  FASHION_FIT_PROFILES,
  resolveFitProfiles,
  normalizeFitProfiles,
  fitProfileForProduct,
  missingFitFields,
  matchCustomFieldToMeasurement,
  type FitProfileDefinition,
} from "../src/addons/fit-passport/lib/fit-passport";
import {
  PLACEHOLDER_SIZE_VALUES,
  isPlaceholderVariant,
  displayVariantParts,
} from "../src/lib/variant-sku-utils";

describe("Phase 4: Fit Profiles Config & Migration", () => {
  const migrationPath = "supabase/migrations/20260918100000_fit_profiles_config.sql";

  it("has the migration file present", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("migration adds fit_profiles jsonb column and updates brand_public_settings view", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS fit_profiles jsonb NULL;");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.brand_public_settings");
    expect(migration).toContain("bs.fit_profiles");
  });
});

describe("Fit Passport Configurable Profiles", () => {
  it("resolves default fashion templates when raw profiles are null, undefined, or empty", () => {
    expect(resolveFitProfiles(null)).toEqual(FASHION_FIT_PROFILES);
    expect(resolveFitProfiles(undefined)).toEqual(FASHION_FIT_PROFILES);
    expect(resolveFitProfiles([])).toEqual(FASHION_FIT_PROFILES);
    expect(resolveFitProfiles("invalid" as any)).toEqual(FASHION_FIT_PROFILES);
    expect(resolveFitProfiles({})).toEqual(FASHION_FIT_PROFILES);
  });

  it("resolves valid custom fit profiles with fallback defaults for missing fields", () => {
    const customProfiles: FitProfileDefinition[] = [
      {
        key: "bisht",
        label_ar: "بشت رجالي",
        label_en: "Men Bisht",
        fields: [
          {
            key: "length",
            label_ar: "طول البشت",
            label_en: "Bisht Length",
            required: true,
            aliases: ["length", "طول"],
          },
          {
            key: "shoulder",
            label_ar: "عرض الكتف",
            label_en: "Shoulder Width",
            required: false,
          },
        ],
      },
    ];

    const resolved = resolveFitProfiles(customProfiles);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].key).toBe("bisht");
    expect(resolved[0].label_ar).toBe("بشت رجالي");
    expect(resolved[0].label_en).toBe("Men Bisht");
    expect(resolved[0].fields).toHaveLength(2);
    expect(resolved[0].fields[0].required).toBe(true);
    expect(resolved[0].fields[1].required).toBe(false);
  });

  it("normalizes fit profiles measurements correctly", () => {
    const raw = {
      abaya: {
        length: 54,
        bust: "38",
        sleeve: 27,
      },
      dress: {
        length: 50,
      },
    };

    const normalized = normalizeFitProfiles(raw);
    expect(normalized.abaya?.length).toBe(54);
    expect(normalized.abaya?.bust).toBe("38");
    expect(normalized.abaya?.sleeve).toBe(27);
    expect(normalized.dress?.length).toBe(50);

    const customProfiles: FitProfileDefinition[] = [
      {
        key: "bisht",
        label_ar: "بشت",
        label_en: "Bisht",
        fields: [{ key: "length", label_ar: "طول", label_en: "Length", required: true }],
      },
    ];
    const customNormalized = normalizeFitProfiles(customProfiles, {
      bisht: { length: 60 },
    });
    expect(customNormalized.bisht?.length).toBe(60);
  });

  it("detects fitProfileForProduct from category and name", () => {
    expect(fitProfileForProduct("عبايات", "عباية تطريز")).toBe("abaya");
    expect(fitProfileForProduct("فساتين", "فستان سهرة")).toBe("dress");

    const customProfiles: FitProfileDefinition[] = [
      {
        key: "suit",
        label_ar: "بدلة",
        label_en: "Suit",
        match: { keywords: ["suit", "بدلة", "بدل"] },
        fields: [{ key: "chest", label_ar: "الصدر", label_en: "Chest", required: true }],
      },
    ];
    expect(fitProfileForProduct(customProfiles, "بدل", "بدلة رسمية")).toBe("suit");
  });

  it("identifies missing required fit fields properly", () => {
    const customProfiles: FitProfileDefinition[] = [
      {
        key: "dress",
        label_ar: "فستان",
        label_en: "Dress",
        fields: [
          { key: "length", label_ar: "الطول", label_en: "Length", required: true },
          { key: "bust", label_ar: "الصدر", label_en: "Bust", required: true },
          { key: "notes", label_ar: "ملاحظات", label_en: "Notes", required: false },
        ],
      },
    ];

    // Only length provided
    const provided = {
      length: "52",
    };
    const missing = missingFitFields(customProfiles, "dress", provided);
    expect(missing).toEqual(["bust"]);

    // All required provided
    const complete = {
      length: "52",
      bust: "36",
    };
    expect(missingFitFields(customProfiles, "dress", complete)).toHaveLength(0);
  });

  it("matches custom field to measurement correctly", () => {
    const field1 = { key: "f1", label_ar: "طول العباية", label_en: "Abaya Length" };
    expect(matchCustomFieldToMeasurement(field1)).toBe("length");

    const field2 = { key: "passport_abaya_bust", label_ar: "الصدر", label_en: "Bust" };
    expect(matchCustomFieldToMeasurement(field2)).toBe("bust");

    const fieldCustom = {
      key: "passport_abaya_sleeve",
      label_ar: "طول الكم",
      label_en: "Sleeve Length",
    };
    expect(matchCustomFieldToMeasurement(fieldCustom)).toBe("sleeve");
  });
});

describe("Placeholder Variant Utilities", () => {
  it("defines standard placeholder values in Arabic and English", () => {
    expect(PLACEHOLDER_SIZE_VALUES).toContain("قياسي");
    expect(PLACEHOLDER_SIZE_VALUES).toContain("Standard");
  });

  it("identifies placeholder variants correctly", () => {
    expect(isPlaceholderVariant({ size: "قياسي" })).toBe(true);
    expect(isPlaceholderVariant({ size: "Standard" })).toBe(true);
    expect(isPlaceholderVariant({ size: " قياسي " })).toBe(true);

    // False if color or fabric is set
    expect(isPlaceholderVariant({ size: "قياسي", color: "أسود" })).toBe(false);
    expect(isPlaceholderVariant({ size: "Standard", fabric: "حرير" })).toBe(false);

    // False for real sizes
    expect(isPlaceholderVariant({ size: "52" })).toBe(false);
    expect(isPlaceholderVariant({ size: "M" })).toBe(false);
    expect(isPlaceholderVariant({ size: "Free Size" })).toBe(false);
    expect(isPlaceholderVariant(null)).toBe(false);
    expect(isPlaceholderVariant(undefined)).toBe(false);
  });

  it("generates display variant parts omitting placeholder sizes", () => {
    // Only placeholder size -> empty parts
    expect(displayVariantParts({ size: "قياسي" })).toEqual([]);
    expect(displayVariantParts({ size: "Standard" })).toEqual([]);

    // Placeholder size with color and fabric -> omits size but keeps color & fabric
    expect(displayVariantParts({ size: "قياسي", color: "كحلي", fabric: "كتان" })).toEqual([
      "كحلي",
      "كتان",
    ]);

    // Real size -> retains all
    expect(displayVariantParts({ size: "56", color: "أسود", fabric: "حرير" })).toEqual([
      "56",
      "أسود",
      "حرير",
    ]);
  });
});
