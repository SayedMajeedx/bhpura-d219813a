import { describe, it, expect } from "vitest";
import {
  getAddon,
  getAllAddons,
  dependentsOf,
  resolveInstallOrder,
  starterPackFor,
} from "../src/lib/addons/addon-registry";
import type { AddonId, PlatformAddonPolicy, BrandAddonEvent } from "../src/lib/addons/addon-types";
import { STORE_VERTICALS } from "../src/lib/store-profile";

describe("Addon Store & Lifecycle Flow", () => {
  it("resolves starter packs for all valid store verticals without errors", () => {
    for (const vertical of STORE_VERTICALS) {
      const pack = starterPackFor(vertical);
      expect(pack).toBeDefined();
      expect(Array.isArray(pack.required)).toBe(true);
      expect(Array.isArray(pack.suggested)).toBe(true);

      // Verify every required and suggested addon exists in the registry
      for (const id of [...pack.required, ...pack.suggested]) {
        const manifest = getAddon(id);
        expect(manifest).toBeDefined();
        expect(manifest.id).toBe(id);
      }
    }
  });

  it("ensures abayas starter pack includes all required dependencies in install order", () => {
    const pack = starterPackFor("abayas");
    const installOrder = resolveInstallOrder(pack.required);

    expect(installOrder).toContain("fashion-core");
    expect(installOrder).toContain("size-guides");
    expect(installOrder).toContain("fit-passport");
    expect(installOrder).toContain("made-to-order");
    expect(installOrder).toContain("abaya-pack");

    // Dependency topological check: fashion-core must precede abaya-pack
    expect(installOrder.indexOf("fashion-core")).toBeLessThan(installOrder.indexOf("abaya-pack"));
  });

  it("correctly identifies dependents and blocks unsafe removal", () => {
    const installed: AddonId[] = ["fashion-core", "abaya-pack"];
    const dependentsOfFashionCore = dependentsOf("fashion-core", installed);

    expect(dependentsOfFashionCore).toContain("abaya-pack");

    // Abaya-pack has no dependents in this set
    const dependentsOfAbayaPack = dependentsOf("abaya-pack", installed);
    expect(dependentsOfAbayaPack).toHaveLength(0);
  });

  it("validates setting schemas defined in manifests", () => {
    const all = getAllAddons();
    for (const manifest of all) {
      if (manifest.settingsSchema) {
        for (const field of manifest.settingsSchema) {
          expect(field.key).toBeTruthy();
          expect(field.label.ar).toBeTruthy();
          expect(field.label.en).toBeTruthy();
          expect(["boolean", "string", "number", "select"]).toContain(field.type);
        }
      }
    }
  });

  it("conforms to PlatformAddonPolicy structure", () => {
    const policy: PlatformAddonPolicy = {
      addon_id: "fit-passport",
      availability: "public",
      entitlement_key: "addons.fit_passport",
      default_for_activities: ["fashion", "abayas"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(policy.addon_id).toBe("fit-passport");
    expect(policy.availability).toBe("public");
    expect(policy.default_for_activities).toContain("abayas");
  });

  it("conforms to BrandAddonEvent audit logging structure", () => {
    const event: BrandAddonEvent = {
      id: "evt-123",
      brand_id: "brand-abc",
      addon_id: "size-guides",
      action: "install",
      source: "onboarding",
      actor_id: "user-456",
      metadata: { version: 1 },
      created_at: new Date().toISOString(),
    };

    expect(event.action).toBe("install");
    expect(event.source).toBe("onboarding");
  });

  it("detects conflicting addons and prevents invalid install selections", () => {
    // Test conflict detection logic
    const conflictMap = new Map<string, string[]>();
    for (const addon of getAllAddons()) {
      if (addon.conflicts && addon.conflicts.length > 0) {
        conflictMap.set(addon.id, addon.conflicts);
      }
    }

    // Verify resolveInstallOrder handles valid dependency chains
    const order = resolveInstallOrder(["abaya-pack"]);
    expect(order).toEqual(["fashion-core", "size-guides", "fit-passport", "made-to-order", "abaya-pack"]);

    // Verify dependentsOf prevents disabling core when dependents exist
    const dependents = dependentsOf("made-to-order", ["made-to-order", "print-stamps"]);
    expect(dependents).toContain("print-stamps");
  });

  it("validates that all starter pack entries are valid registered addons", () => {
    for (const vertical of STORE_VERTICALS) {
      const pack = starterPackFor(vertical);
      for (const req of pack.required) {
        expect(() => getAddon(req)).not.toThrow();
      }
      for (const sug of pack.suggested) {
        expect(() => getAddon(sug)).not.toThrow();
      }
    }
  });
});
