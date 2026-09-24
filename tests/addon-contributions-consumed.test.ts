import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  contributionsFor,
  vocabularyFrom,
  aiContextFrom,
  variantAxisDefaultsFrom,
  customFieldPresetsFrom,
  sizingPresetsFrom,
  sizingPresetOrderFrom,
  readinessChecksFrom,
  productionStagesFrom,
  trustBadgeSuggestionsFrom,
} from "../src/lib/addons/addon-registry";
import type { BrandAddonRow } from "../src/lib/addons/addon-types";

/**
 * Consumer mapping for all contribution types declared in AddonContributions.
 * Every contribution must have at least one active consumer outside src/addons and src/lib/addons.
 */
interface ContributionConsumerDefinition {
  files: string[];
  expectedIdentifiers: string[];
  description: string;
}

const KNOWN_CONTRIBUTION_CONSUMERS: Record<string, ContributionConsumerDefinition> = {
  slots: {
    files: ["src/components/addons/AddonSlot.tsx", "src/routes/$slug.product.$id.tsx"],
    expectedIdentifiers: ["AddonSlot", "storefront.product.optionsAside"],
    description: "Rendered via AddonSlot across storefront and admin views",
  },
  navItems: {
    files: ["src/config/admin-navigation.ts", "src/components/os/os-sidebar.tsx"],
    expectedIdentifiers: ["size-guides", "navItems"],
    description: "Merged into modular navigation items for admin sidebar and mobile navigation",
  },
  customFieldPresets: {
    files: ["src/features/inventory/hooks/use-product-dialog-data.ts"],
    expectedIdentifiers: ["customFieldPresetsFrom"],
    description: "Extracted via customFieldPresetsFrom for product custom field options",
  },
  sizingPresetOrder: {
    files: ["src/features/inventory/components/BulkVariantDialog.tsx"],
    expectedIdentifiers: ["sizingPresetOrderFrom"],
    description: "Extracted via sizingPresetOrderFrom to prioritize vertical sizing presets",
  },
  sizingPresets: {
    files: ["src/features/inventory/components/BulkVariantDialog.tsx"],
    expectedIdentifiers: ["sizingPresetsFrom"],
    description: "Extracted via sizingPresetsFrom to supply vertical sizing templates",
  },
  vocabulary: {
    files: [
      "src/hooks/use-vocabulary.ts",
      "src/lib/store-vocabulary.ts",
      "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx",
    ],
    expectedIdentifiers: ["useVocabulary", "resolveVocabulary"],
    description:
      "Merged into store vocabulary for vertical-aware UI terms across orders, PDP, and invoices",
  },
  productionStages: {
    files: [
      "src/routes/_authenticated/admin.b.$slug.orders.index.tsx",
      "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx",
    ],
    expectedIdentifiers: ["productionStages"],
    description:
      "Extracted via productionStagesFrom or hasMadeToOrder to toggle workshop stage pipelines in orders",
  },
  variantAxisDefaults: {
    files: ["src/features/inventory/hooks/use-inventory-axis-defaults.ts"],
    expectedIdentifiers: ["variantAxisDefaultsFrom"],
    description: "Extracted via variantAxisDefaultsFrom for vertical variant axis labels",
  },
  settingsPatchOnInstall: {
    files: ["src/components/addons/AddonStore.tsx", "src/components/settings/StoreProfileCard.tsx"],
    expectedIdentifiers: ["installAddon"],
    description: "Applied on addon install to configure vertical-specific business settings",
  },
  aiContext: {
    files: ["src/lib/store-profile.server.ts"],
    expectedIdentifiers: ["getBrandAiContext"],
    description: "Consumed to enrich AI prompt builder with store vertical context and vocabulary",
  },
  readinessChecks: {
    files: ["src/components/settings/StoreReadinessChecklist.tsx"],
    expectedIdentifiers: ["readinessChecksFrom"],
    description: "Extracted via readinessChecksFrom to add vertical-specific pre-launch checks",
  },
  trustBadgeSuggestions: {
    files: ["src/components/settings/TrustBadgesEditor.tsx"],
    expectedIdentifiers: ["trustBadgeSuggestionsFrom"],
    description: "Extracted via trustBadgeSuggestionsFrom to recommend vertical trust badges",
  },
};

describe("Addon Contributions Consumer Guard", () => {
  it("ensures all declared keys in AddonContributions have documented active consumers", () => {
    // 1. Read src/lib/addons/addon-types.ts and parse the AddonContributions type definition
    const addonTypesPath = path.resolve(process.cwd(), "src/lib/addons/addon-types.ts");
    expect(fs.existsSync(addonTypesPath)).toBe(true);

    const content = fs.readFileSync(addonTypesPath, "utf8");
    const startIndex = content.indexOf("export type AddonContributions = {");
    expect(startIndex).toBeGreaterThan(0);

    const endIndex = content.indexOf("export type AddonManifest = {", startIndex);
    expect(endIndex).toBeGreaterThan(startIndex);

    const typeBody = content.slice(startIndex, endIndex);
    const propRegex = /^[ ]{2}([a-zA-Z0-9_]+)\s*\??\s*:/gm;
    const declaredProps: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = propRegex.exec(typeBody)) !== null) {
      declaredProps.push(match[1]);
    }

    expect(declaredProps.length).toBe(12);

    // 2. Every single declared property must have a consumer registered in KNOWN_CONTRIBUTION_CONSUMERS
    for (const prop of declaredProps) {
      expect(
        KNOWN_CONTRIBUTION_CONSUMERS[prop],
        `Contribution property "${prop}" in AddonContributions has no registered consumer! If you add a new contribution type, you MUST implement its consumer outside src/addons and src/lib/addons, and register it in this test.`,
      ).toBeDefined();
    }

    // 3. Every registered consumer must point to existing files outside src/addons and src/lib/addons
    for (const [prop, consumer] of Object.entries(KNOWN_CONTRIBUTION_CONSUMERS)) {
      expect(consumer.files.length).toBeGreaterThan(0);

      for (const fileRel of consumer.files) {
        expect(fileRel.startsWith("src/addons/")).toBe(false);
        expect(fileRel.startsWith("src/lib/addons/")).toBe(false);

        const filePath = path.resolve(process.cwd(), fileRel);
        expect(
          fs.existsSync(filePath),
          `Consumer file "${fileRel}" for contribution "${prop}" does not exist on disk!`,
        ).toBe(true);

        const fileContent = fs.readFileSync(filePath, "utf8");
        const containsAtLeastOneExpected = consumer.expectedIdentifiers.some((id) =>
          fileContent.includes(id),
        );
        expect(
          containsAtLeastOneExpected,
          `Consumer file "${fileRel}" does not contain any of expected identifiers: ${consumer.expectedIdentifiers.join(", ")}`,
        ).toBe(true);
      }
    }
  });

  it("extracts contributions correctly from installed addon rows", () => {
    const mockRows: BrandAddonRow[] = [
      {
        brand_id: "test-brand",
        addon_id: "fashion-core",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "starter_pack",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        brand_id: "test-brand",
        addon_id: "abaya-pack",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "starter_pack",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        brand_id: "test-brand",
        addon_id: "size-guides",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "starter_pack",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        brand_id: "test-brand",
        addon_id: "made-to-order",
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
        brand_id: "test-brand",
        addon_id: "digital-products",
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

    // slots
    const slots = contributionsFor(mockRows, "storefront.product.optionsAside");
    expect(slots.length).toBeGreaterThanOrEqual(1);

    // vocabulary
    const abayaVocab = vocabularyFrom(
      mockRows.filter((r) => ["fashion-core", "abaya-pack"].includes(r.addon_id)),
    );
    expect(abayaVocab.custom_order?.ar).toBe("تفصيل");
    expect(abayaVocab.workshop?.ar).toBe("الخياط");

    const allVocab = vocabularyFrom(mockRows);
    expect(allVocab.custom_order?.ar).toBe("تفصيل");

    // aiContext
    const ai = aiContextFrom(mockRows, { brandName: "دار التصاميم", lang: "ar" });
    expect(ai).toContain("دار التصاميم");
    expect(ai).toContain("الأزياء");

    // variantAxisDefaults
    const abayaAxes = variantAxisDefaultsFrom(
      mockRows.filter((r) => ["fashion-core", "abaya-pack"].includes(r.addon_id)),
    );
    expect(abayaAxes.size?.ar).toBe("مقاس العباية");
    expect(abayaAxes.fabric?.ar).toBe("نوع القماش");

    const digitalAxes = variantAxisDefaultsFrom(
      mockRows.filter((r) => r.addon_id === "digital-products"),
    );
    expect(digitalAxes.fabric).toBeNull();
    expect(digitalAxes.size).toBeNull();

    // customFieldPresets
    const customFields = customFieldPresetsFrom(mockRows);
    expect(customFields.length).toBeGreaterThan(0);
    expect(customFields.some((f) => f.key === "fashion")).toBe(true);

    // sizingPresets
    const sizingPresets = sizingPresetsFrom(mockRows);
    expect(sizingPresets.length).toBeGreaterThan(0);
    expect(sizingPresets.some((p) => p.id === "abaya_gulf")).toBe(true);

    // sizingPresetOrder
    const sizingOrder = sizingPresetOrderFrom(mockRows);
    expect(sizingOrder).toContain("abaya_gulf");

    // readinessChecks
    const readiness = readinessChecksFrom(mockRows);
    expect(readiness.length).toBeGreaterThan(0);

    // productionStages
    const stages = productionStagesFrom(mockRows);
    expect(stages).toBe(true);

    // trustBadgeSuggestions
    const trustBadges = trustBadgeSuggestionsFrom(mockRows);
    expect(trustBadges).toContain("Scissors");
  });
});
