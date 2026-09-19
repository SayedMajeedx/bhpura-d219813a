import { describe, expect, it } from "vitest";
import {
  listAddons,
  variantAxisDefaultsFrom,
  resolveVariantAxis,
} from "../src/lib/addons/addon-registry";
import {
  DEFAULT_MOBILE_VOCABULARY,
  resolveMobileVocabulary,
} from "../apps/boutq-os-mobile/src/lib/store-vocabulary";

describe("Activity Packs & Variant Axes Resolution", () => {
  it("all 7 activity packs and extension manifests validate cleanly in registry", () => {
    const requiredManifestIds = [
      "beauty-perfume",
      "food-beverage",
      "digital-products",
      "gifts",
      "print-stamps",
      "jewelry",
      "fashion-core",
    ];

    const allAddons = listAddons();

    for (const id of requiredManifestIds) {
      const manifest = allAddons.find((m) => m.id === id);
      expect(manifest, `Manifest for ${id} should exist in registry`).toBeDefined();
      expect(manifest?.whatItAdds?.length).toBeGreaterThan(0);
      expect(manifest?.name?.ar).toBeTruthy();
      expect(manifest?.name?.en).toBeTruthy();
    }
  });

  describe("variantAxisDefaultsFrom", () => {
    it("returns empty object for vanilla store with no installed addons", () => {
      const defaults = variantAxisDefaultsFrom([]);
      expect(defaults).toEqual({});
    });

    it("resolves perfumes axis defaults (volume size, concentration color, disabled fabric)", () => {
      const defaults = variantAxisDefaultsFrom([
        { addon_id: "beauty-perfume", status: "installed" },
      ]);
      expect(defaults).toBeDefined();
      expect(defaults?.size).toEqual({ ar: "الحجم", en: "Volume" });
      expect(defaults?.color).toEqual({ ar: "التركيز", en: "Concentration" });
      expect(defaults?.fabric).toBeNull();
    });

    it("resolves food-beverage axis defaults (weight/size, flavor/option, disabled fabric)", () => {
      const defaults = variantAxisDefaultsFrom([
        { addon_id: "food-beverage", status: "installed" },
      ]);
      expect(defaults).toBeDefined();
      expect(defaults?.size).toEqual({ ar: "الوزن / الحجم", en: "Weight / Size" });
      expect(defaults?.color).toEqual({ ar: "النكهة / الخيار", en: "Flavor / Option" });
      expect(defaults?.fabric).toBeNull();
    });

    it("resolves jewelry axis defaults (ring size, metal color, disabled fabric)", () => {
      const defaults = variantAxisDefaultsFrom([{ addon_id: "jewelry", status: "installed" }]);
      expect(defaults).toBeDefined();
      expect(defaults?.size).toEqual({ ar: "مقاس الخاتم", en: "Ring Size" });
      expect(defaults?.color).toEqual({ ar: "نوع المعدن", en: "Metal Type" });
      expect(defaults?.fabric).toBeNull();
    });

    it("resolves digital-products axis defaults (disabled size, color, and fabric)", () => {
      const defaults = variantAxisDefaultsFrom([
        { addon_id: "digital-products", status: "installed" },
      ]);
      expect(defaults).toBeDefined();
      expect(defaults?.size).toBeNull();
      expect(defaults?.color).toBeNull();
      expect(defaults?.fabric).toBeNull();
    });
  });

  describe("resolveVariantAxis 4-tier hierarchy", () => {
    const perfumeDefaults = variantAxisDefaultsFrom([
      { addon_id: "beauty-perfume", status: "installed" },
    ]);

    it("Priority 1: Product-level custom label overrides addon defaults and activates axis", () => {
      const resolved = resolveVariantAxis({
        axis: "fabric",
        product: {
          variant_label_fabric_ar: "نوع التغليف",
          variant_label_fabric_en: "Packaging Type",
        },
        addonDefaults: perfumeDefaults,
        lang: "ar",
      });

      expect(resolved.visible).toBe(true);
      expect(resolved.isCustom).toBe(true);
      expect(resolved.label).toBe("نوع التغليف");
    });

    it("Priority 2: Addon default is used when product-level label is empty", () => {
      const resolved = resolveVariantAxis({
        axis: "size",
        product: {},
        addonDefaults: perfumeDefaults,
        lang: "ar",
      });

      expect(resolved.visible).toBe(true);
      expect(resolved.isCustom).toBe(false);
      expect(resolved.label).toBe("الحجم");
    });

    it("Priority 3: Axis is disabled when addon explicitly declares axis null and no product override exists", () => {
      const resolvedFabricAr = resolveVariantAxis({
        axis: "fabric",
        product: {},
        addonDefaults: perfumeDefaults,
        lang: "ar",
      });

      expect(resolvedFabricAr.visible).toBe(false);
      expect(resolvedFabricAr.isCustom).toBe(false);
      expect(resolvedFabricAr.label).toBe("الخامة");

      const resolvedFabricEn = resolveVariantAxis({
        axis: "fabric",
        product: {},
        addonDefaults: perfumeDefaults,
        lang: "en",
      });

      expect(resolvedFabricEn.visible).toBe(false);
      expect(resolvedFabricEn.isCustom).toBe(false);
      expect(resolvedFabricEn.label).toBe("Fabric");
    });

    it("Priority 4: Vanilla fallback applies when store has no addon overrides", () => {
      const resolved = resolveVariantAxis({
        axis: "size",
        product: {},
        addonDefaults: null,
        lang: "ar",
      });

      expect(resolved.visible).toBe(true);
      expect(resolved.isCustom).toBe(false);
      expect(resolved.label).toBe("المقاس / خيار");
    });
  });

  describe("Mobile Vocabulary Resolution", () => {
    it("provides vanilla generic vocabulary by default", () => {
      const vocab = resolveMobileVocabulary([], "general");
      expect(vocab.workshop.ar).toBe("الورشة");
      expect(vocab.workshop.en).toBe("Workshop");
      expect(vocab.sent_to_workshop.ar).toBe("تم الإرسال للورشة");
      expect(vocab.sent_to_workshop.en).toBe("Sent to Workshop");
    });

    it("resolves tailor vocabulary when fashion-core or abaya-pack is installed or vertical is fashion", () => {
      const vocabWithAddon = resolveMobileVocabulary(["fashion-core"]);
      expect(vocabWithAddon.workshop.ar).toBe("الخياط");
      expect(vocabWithAddon.workshop.en).toBe("Tailor");
      expect(vocabWithAddon.sent_to_workshop.ar).toBe("تم الإرسال للخياط");
      expect(vocabWithAddon.sent_to_workshop.en).toBe("Sent to Tailor");

      const vocabWithVertical = resolveMobileVocabulary([], "abayas");
      expect(vocabWithVertical.workshop.ar).toBe("الخياط");
      expect(vocabWithVertical.workshop.en).toBe("Tailor");
    });

    it("applies brand custom vocabulary overrides over defaults", () => {
      const vocab = resolveMobileVocabulary([], "general", {
        workshop: { ar: "المعمل", en: "Lab" },
      });
      expect(vocab.workshop.ar).toBe("المعمل");
      expect(vocab.workshop.en).toBe("Lab");
      expect(vocab.sent_to_workshop.ar).toBe("تم الإرسال للورشة");
    });
  });
});
