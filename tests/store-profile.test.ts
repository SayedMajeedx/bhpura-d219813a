import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveStoreModules,
  normalizeVertical,
  normalizeModuleOverrides,
  legacyBusinessTypeToVertical,
} from "../src/lib/store-profile";
import { orderSizingPresetsForVertical } from "../src/lib/variant-sku-utils";

describe("store-profile pure library", () => {
  it("resolves default modules correctly for each vertical", () => {
    expect(resolveStoreModules({ store_vertical: "abayas" })).toEqual({
      size_guide: true,
      fit_passport: true,
      made_to_order: true,
    });
    expect(resolveStoreModules({ store_vertical: "fashion" })).toEqual({
      size_guide: true,
      fit_passport: true,
      made_to_order: true,
    });
    expect(resolveStoreModules({ store_vertical: "general" })).toEqual({
      size_guide: false,
      fit_passport: false,
      made_to_order: false,
    });
    expect(resolveStoreModules({ store_vertical: "jewelry" })).toEqual({
      size_guide: true,
      fit_passport: false,
      made_to_order: true,
    });
  });

  it("applies module overrides on top of vertical defaults", () => {
    expect(
      resolveStoreModules({
        store_vertical: "fashion",
        store_modules: { fit_passport: false },
      }),
    ).toEqual({
      size_guide: true,
      fit_passport: false,
      made_to_order: true,
    });
    expect(
      resolveStoreModules({
        store_vertical: "general",
        store_modules: { size_guide: true },
      }),
    ).toEqual({
      size_guide: true,
      fit_passport: false,
      made_to_order: false,
    });
  });

  it("normalizes unknown vertical to general", () => {
    expect(normalizeVertical("abaya")).toBe("general");
    expect(normalizeVertical("abayas")).toBe("abayas");
    expect(normalizeVertical(undefined)).toBe("general");
    expect(normalizeVertical(null)).toBe("general");
    expect(normalizeVertical("")).toBe("general");
  });

  it("normalizes malformed module overrides safely", () => {
    expect(normalizeModuleOverrides([1, 2, 3])).toEqual({});
    expect(normalizeModuleOverrides("not-an-object")).toEqual({});
    expect(normalizeModuleOverrides({ fit_passport: "yes", size_guide: true })).toEqual({
      size_guide: true,
    });
  });

  it("maps legacy business types to verticals correctly", () => {
    expect(legacyBusinessTypeToVertical("Cafe / Restaurant")).toBe("food");
    expect(legacyBusinessTypeToVertical("Digital store")).toBe("digital");
    expect(legacyBusinessTypeToVertical("Abayas & Fashion")).toBe("abayas");
    expect(legacyBusinessTypeToVertical("عبايات وتفصيل")).toBe("abayas");
    expect(legacyBusinessTypeToVertical("Boutique & Fashion")).toBe("fashion");
    expect(legacyBusinessTypeToVertical("Unknown")).toBe("general");
    expect(legacyBusinessTypeToVertical(null)).toBe("general");
  });

  it("reorders sizing presets to put abaya presets at the end for non-fashion verticals", () => {
    const abayas = orderSizingPresetsForVertical("abayas");
    expect(abayas[0].labelEn).toContain("Abayas");

    const fashion = orderSizingPresetsForVertical("fashion");
    expect(fashion[0].labelEn).toContain("Abayas");

    const food = orderSizingPresetsForVertical("food");
    expect(food[food.length - 1].labelEn).toContain("Abayas");
  });
});

// The screens are rendered in tests/store-profile-surfaces.test.tsx (account Fit
// Passport tab, paywall, store profile card, settings form) and
// tests/onboarding-plan-catalog.test.tsx (mandatory vertical). The size guide
// mounts through its addon slot (tests/addon-contributions-consumed.test.ts).
describe("store profile database contract", () => {
  it("migration adds columns and exposes them in public view", () => {
    const migPath = resolve(
      __dirname,
      "../supabase/migrations/20260915100000_store_vertical_and_modules.sql",
    );
    expect(existsSync(migPath)).toBe(true);
    const sql = readFileSync(migPath, "utf-8");
    expect(sql).toContain("store_vertical");
    expect(sql).toContain("store_modules");
    expect(sql).toMatch(/brand_public_settings[\s\S]*bs\.store_modules/);
  });

  it("migration drops ON DELETE CASCADE on business_settings_user_id_fkey and heals missing rows", () => {
    const migPath = resolve(
      __dirname,
      "../supabase/migrations/20260928110000_fix_business_settings_cascade_and_missing_rows.sql",
    );
    expect(existsSync(migPath)).toBe(true);
    const sql = readFileSync(migPath, "utf-8");
    expect(sql).toContain(
      "ALTER TABLE public.business_settings ALTER COLUMN user_id DROP NOT NULL",
    );
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("ensure_brand_business_settings");
  });
});
