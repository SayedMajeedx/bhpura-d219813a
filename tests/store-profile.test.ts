import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
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

describe("storefront & admin gating (source checks)", () => {
  it("gates Fit Passport tab on account page behind modules.fit_passport", () => {
    const code = readFileSync(resolve(__dirname, "../src/routes/$slug.account.tsx"), "utf-8");
    expect(code).toContain("modules.fit_passport &&");
    expect(code).toMatch(/modules\.fit_passport\s*&&\s*\(?\s*<TabsTrigger[^>]*value="fit"/);
  });

  it("gates SizeGuideModal on product page behind modules.size_guide", () => {
    const code = readFileSync(resolve(__dirname, "../src/routes/$slug.product.$id.tsx"), "utf-8");
    expect(
      code.includes("storefront.product.optionsAside") ||
        code.includes("modules.size_guide && <SizeGuideModal"),
    ).toBe(true);
  });

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

  it("onboarding functions enforce mandatory vertical and strip Abayas & Fashion fallback", () => {
    const code = readFileSync(resolve(__dirname, "../src/lib/onboarding.functions.ts"), "utf-8");
    expect(code).not.toContain('"Abayas & Fashion"');
    expect(code).toMatch(/storeVertical:\s*z\.enum\(STORE_VERTICALS\)/);
  });

  it("onboarding UI forces manual vertical selection and drops fashion-only copy", () => {
    const code = readFileSync(resolve(__dirname, "../src/routes/onboard.tsx"), "utf-8");
    expect(code).not.toContain('"Boutique & Fashion"');
    expect(code).toMatch(/useState<StoreVertical\s*\|\s*null>\(null\)/);
    expect(code).toContain("Launch Your Boutique");
  });

  it("paywall copy drops fashion references", () => {
    const code = readFileSync(
      resolve(__dirname, "../src/components/admin/TrialExpiredPaywall.tsx"),
      "utf-8",
    );
    expect(code).not.toMatch(/fashion/i);
  });
});
