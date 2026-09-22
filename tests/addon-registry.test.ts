import { describe, it, expect } from "vitest";
import {
  getAddon,
  listAddons,
  validateRegistry,
  resolveInstallOrder,
  dependentsOf,
  starterPackFor,
  isInstalled,
  contributionsFor,
  vocabularyFrom,
  aiContextFrom,
} from "../src/lib/addons/addon-registry";
import type { BrandAddonRow, PlatformAddonPolicy } from "../src/lib/addons/addon-types";
import { STORE_VERTICALS } from "../src/lib/store-profile";

describe("Addon Registry", () => {
  it("validates that all manifests in registry are error-free", () => {
    const errors = validateRegistry();
    expect(errors).toEqual([]);
  });

  it("lists all registered addons", () => {
    const addons = listAddons();
    // One manifest per directory under src/addons (registry.ts excluded).
    expect(addons.length).toBe(12);
    const ids = addons.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("coffee-roastery");
    expect(ids).toContain("size-guides");
    expect(ids).toContain("fit-passport");
    expect(ids).toContain("made-to-order");
    expect(ids).toContain("fashion-core");
    expect(ids).toContain("abaya-pack");
  });

  it("retrieves a manifest by id or throws on unknown id", () => {
    const sg = getAddon("size-guides");
    expect(sg.id).toBe("size-guides");
    expect(sg.name.ar).toBe("أدلة المقاسات");

    expect(() => getAddon("unknown-addon" as any)).toThrow();
  });

  it("resolves installation order topologically respecting dependencies", () => {
    const order = resolveInstallOrder(["abaya-pack"]);
    // abaya-pack requires: fashion-core, size-guides, fit-passport, made-to-order
    expect(order.indexOf("fashion-core")).toBeLessThan(order.indexOf("abaya-pack"));
    expect(order.indexOf("size-guides")).toBeLessThan(order.indexOf("abaya-pack"));
    expect(order.indexOf("fit-passport")).toBeLessThan(order.indexOf("abaya-pack"));
    expect(order.indexOf("made-to-order")).toBeLessThan(order.indexOf("abaya-pack"));
    expect(order[order.length - 1]).toBe("abaya-pack");
  });

  it("identifies dependent addons preventing unsafe uninstallation", () => {
    const installed = ["size-guides", "made-to-order", "jewelry"] as const;
    const depsOfSizeGuides = dependentsOf("size-guides", [...installed]);
    expect(depsOfSizeGuides).toContain("jewelry");

    const depsOfJewelry = dependentsOf("jewelry", [...installed]);
    expect(depsOfJewelry).toEqual([]);
  });

  it("provides correct starter pack for every vertical", () => {
    for (const vertical of STORE_VERTICALS) {
      const pack = starterPackFor(vertical);
      expect(pack).toBeDefined();
      expect(Array.isArray(pack.required)).toBe(true);
      expect(Array.isArray(pack.suggested)).toBe(true);
    }

    const abayasPack = starterPackFor("abayas");
    expect(abayasPack.required).toEqual([
      "fashion-core",
      "size-guides",
      "fit-passport",
      "made-to-order",
      "abaya-pack",
    ]);

    const fashionPack = starterPackFor("fashion");
    expect(fashionPack.required).toEqual([
      "fashion-core",
      "size-guides",
      "fit-passport",
      "made-to-order",
    ]);

    const generalPack = starterPackFor("general");
    expect(generalPack.required).toEqual([]);
    expect(generalPack.suggested).toEqual([]);
  });

  it("checks installed status correctly", () => {
    const mockRows: BrandAddonRow[] = [
      {
        brand_id: "b1",
        addon_id: "size-guides",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "manual",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        brand_id: "b1",
        addon_id: "fit-passport",
        status: "disabled",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "manual",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    expect(isInstalled(mockRows, "size-guides")).toBe(true);
    expect(isInstalled(mockRows, "fit-passport")).toBe(false);
    expect(isInstalled(mockRows, "made-to-order")).toBe(false);
  });

  it("filters contributions by placement and sorts by order", () => {
    const mockRows: BrandAddonRow[] = [
      {
        brand_id: "b1",
        addon_id: "size-guides",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "manual",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const slots = contributionsFor(mockRows, "storefront.product.optionsAside");
    expect(slots.length).toBe(1);
    expect(slots[0].addonId).toBe("size-guides");
  });

  it("derives vocabulary and AI context from installed addons", () => {
    const mockRows: BrandAddonRow[] = [
      {
        brand_id: "b1",
        addon_id: "fashion-core",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "manual",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const vocab = vocabularyFrom(mockRows);
    expect(vocab.workshop?.ar).toBe("الخياط");

    const ai = aiContextFrom(mockRows, { brandName: "دار الأناقة", lang: "ar" });
    expect(ai).toContain("دار الأناقة");
    expect(ai).toContain("الأزياء");
  });

  it("starterPackFor respects platform_addon_policies default_for_activities overrides", () => {
    const policies: PlatformAddonPolicy[] = [
      {
        id: "pol-1",
        addon_id: "gifts",
        is_default_for_all: false,
        default_for_activities: ["fashion", "abayas"],
        availability: "general",
        min_tier: "free",
        allowed_brand_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const result = starterPackFor("fashion", policies);
    expect(result.required).toEqual(["gifts"]);

    // If no policy matches the activity, falls back to static defaults
    const fallbackResult = starterPackFor("digital", policies);
    expect(fallbackResult.required).toEqual(["digital-products"]);
  });
});
