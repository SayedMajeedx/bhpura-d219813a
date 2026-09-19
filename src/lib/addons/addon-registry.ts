import { ADDON_MANIFESTS } from "@/addons/registry";
import type {
  AddonId,
  AddonManifest,
  AddonReadinessCheck,
  AddonSettingsField,
  BrandAddonRow,
  SizingPreset,
  SlotComponent,
  SlotPlacement,
  StoreVocabulary,
} from "./addon-types";
import { TRUST_ICON_CATALOG } from "@/lib/trust-badges";
import { starterPackFor } from "./starter-packs";

export { starterPackFor };

export type { AddonManifest, AddonReadinessCheck, AddonSettingsField, SizingPreset };

const MANIFEST_MAP = new Map<AddonId, AddonManifest>(ADDON_MANIFESTS.map((m) => [m.id, m]));

export function getAddon(id: AddonId): AddonManifest {
  const manifest = MANIFEST_MAP.get(id);
  if (!manifest) {
    throw new Error(`Addon manifest not found for id: "${id}"`);
  }
  return manifest;
}

export function listAddons(): AddonManifest[] {
  return [...ADDON_MANIFESTS];
}

export const getAllAddons = listAddons;

export function validateRegistry(): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenSlotIds = new Set<string>();

  const validTrustBadgeIds = new Set<string>(TRUST_ICON_CATALOG.map((item) => item.id));
  const validSlotPlacements = new Set<string>([
    "storefront.product.optionsAside",
    "storefront.product.afterOptions",
    "storefront.product.afterCta",
    "storefront.account.tab",
    "storefront.footer.helpLink",
    "admin.settings.card",
    "admin.product.editorPanel",
    "admin.order.itemPanel",
    "admin.order.headerActions",
    "admin.customer.panel",
    "admin.readiness.check",
  ]);

  const allKnownPresetIds = new Set<string>();
  for (const m of ADDON_MANIFESTS) {
    if (m.contributions.sizingPresets) {
      for (const p of m.contributions.sizingPresets) {
        allKnownPresetIds.add(p.id);
      }
    }
  }

  for (const manifest of ADDON_MANIFESTS) {
    // Unique addon id
    if (seenIds.has(manifest.id)) {
      errors.push(`Duplicate addon id found: "${manifest.id}"`);
    }
    seenIds.add(manifest.id);

    // whatItAdds must have at least 1 item
    if (!manifest.whatItAdds || manifest.whatItAdds.length === 0) {
      errors.push(`Addon "${manifest.id}" must define at least one item in whatItAdds`);
    }

    // Dependencies must exist
    if (manifest.requires) {
      for (const reqId of manifest.requires) {
        if (!MANIFEST_MAP.has(reqId)) {
          errors.push(`Addon "${manifest.id}" requires non-existent addon "${reqId}"`);
        }
        if (reqId === manifest.id) {
          errors.push(`Addon "${manifest.id}" cannot require itself`);
        }
      }
    }

    // Conflicts must exist and not be self
    if (manifest.conflicts) {
      for (const confId of manifest.conflicts) {
        if (!MANIFEST_MAP.has(confId)) {
          errors.push(`Addon "${manifest.id}" conflicts with non-existent addon "${confId}"`);
        }
        if (confId === manifest.id) {
          errors.push(`Addon "${manifest.id}" cannot conflict with itself`);
        }
      }
    }

    // Unique slot ids across all slots & valid placement
    if (manifest.contributions.slots) {
      for (const slot of manifest.contributions.slots) {
        if (seenSlotIds.has(slot.id)) {
          errors.push(`Duplicate slot id found: "${slot.id}" in addon "${manifest.id}"`);
        }
        seenSlotIds.add(slot.id);

        if (!validSlotPlacements.has(slot.placement)) {
          errors.push(
            `Addon "${manifest.id}" has invalid slot placement "${slot.placement}" in slot "${slot.id}"`,
          );
        }
      }
    }

    // Sizing preset order references must exist in registered presets
    if (manifest.contributions.sizingPresetOrder) {
      for (const presetId of manifest.contributions.sizingPresetOrder) {
        if (!allKnownPresetIds.has(presetId)) {
          errors.push(
            `Addon "${manifest.id}" references non-existent sizing preset id "${presetId}" in sizingPresetOrder`,
          );
        }
      }
    }

    // Trust badge suggestions must exist in TRUST_ICON_CATALOG
    if (manifest.contributions.trustBadgeSuggestions) {
      for (const badgeId of manifest.contributions.trustBadgeSuggestions) {
        if (!validTrustBadgeIds.has(badgeId)) {
          errors.push(
            `Addon "${manifest.id}" references non-existent trust badge id "${badgeId}" in trustBadgeSuggestions`,
          );
        }
      }
    }

    // Unique seed keys within an addon
    if (manifest.seeds) {
      const seenSeedKeys = new Set<string>();
      for (const seed of manifest.seeds) {
        if (seenSeedKeys.has(seed.key)) {
          errors.push(`Duplicate seed key "${seed.key}" in addon "${manifest.id}"`);
        }
        seenSeedKeys.add(seed.key);
      }
    }
  }

  // Detect circular dependencies
  const visited = new Set<AddonId>();
  const visiting = new Set<AddonId>();

  function checkCycle(id: AddonId, path: AddonId[]) {
    if (visiting.has(id)) {
      errors.push(`Circular dependency detected: ${[...path, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id)) return;

    visiting.add(id);
    const m = MANIFEST_MAP.get(id);
    if (m?.requires) {
      for (const req of m.requires) {
        checkCycle(req, [...path, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const manifest of ADDON_MANIFESTS) {
    if (!visited.has(manifest.id)) {
      checkCycle(manifest.id, []);
    }
  }

  return errors;
}

export function resolveInstallOrder(ids: AddonId[]): AddonId[] {
  const result: AddonId[] = [];
  const visited = new Set<AddonId>();
  const visiting = new Set<AddonId>();

  function visit(id: AddonId) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular dependency detected involving addon: "${id}"`);
    }

    visiting.add(id);
    const manifest = MANIFEST_MAP.get(id);
    if (manifest?.requires) {
      for (const reqId of manifest.requires) {
        visit(reqId);
      }
    }
    visiting.delete(id);
    visited.add(id);
    result.push(id);
  }

  for (const id of ids) {
    visit(id);
  }

  return result;
}

export function dependentsOf(id: AddonId, installed: AddonId[]): AddonId[] {
  const dependents: AddonId[] = [];
  const installedSet = new Set(installed);

  for (const instId of installedSet) {
    if (instId === id) continue;
    const manifest = MANIFEST_MAP.get(instId);
    if (manifest?.requires && manifest.requires.includes(id)) {
      dependents.push(instId);
    }
  }

  return dependents;
}

export function isInstalled(rows: BrandAddonRow[] | null | undefined, id: AddonId): boolean {
  if (!rows || !Array.isArray(rows)) return false;
  return rows.some((r) => r.addon_id === id && r.status === "installed");
}

export function contributionsFor(
  rows: BrandAddonRow[] | null | undefined,
  placement: SlotPlacement,
): SlotComponent[] {
  if (!rows || !Array.isArray(rows)) return [];
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const matched: SlotComponent[] = [];
  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.slots) {
      for (const slot of manifest.contributions.slots) {
        if (slot.placement === placement) {
          matched.push({
            ...slot,
            addonId: manifest.id,
          });
        }
      }
    }
  }

  return matched.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

export function vocabularyFrom(rows: BrandAddonRow[] | null | undefined): Partial<StoreVocabulary> {
  if (!rows || !Array.isArray(rows)) return {};
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const merged: Partial<StoreVocabulary> = {};
  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.vocabulary) {
      Object.assign(merged, manifest.contributions.vocabulary);
    }
  }

  return merged;
}

export function aiContextFrom(
  rows: BrandAddonRow[] | null | undefined,
  ctx: { brandName: string; lang: "ar" | "en" },
): string {
  if (!rows || !Array.isArray(rows)) return "";
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const parts: string[] = [];
  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.aiContext) {
      const part = manifest.contributions.aiContext(ctx);
      if (part) parts.push(part);
    }
  }

  return parts.join("\n");
}

export function variantAxisDefaultsFrom(
  rows?: BrandAddonRow[] | null,
  storeVertical?: string | null,
): {
  size?: { ar: string; en: string } | null;
  color?: { ar: string; en: string } | null;
  fabric?: { ar: string; en: string } | null;
} {
  const out: {
    size?: { ar: string; en: string } | null;
    color?: { ar: string; en: string } | null;
    fabric?: { ar: string; en: string } | null;
  } = {};

  // 1. If storeVertical is specified, seed defaults from manifests configured for this vertical activity
  if (storeVertical) {
    const norm = storeVertical.trim().toLowerCase();
    for (const manifest of ADDON_MANIFESTS) {
      if (manifest.activities && manifest.activities.map((a) => a.toLowerCase()).includes(norm)) {
        if (manifest.contributions.variantAxisDefaults) {
          Object.assign(out, manifest.contributions.variantAxisDefaults);
        }
      }
    }
  }

  // 2. If installed brand addons are provided, merge their explicit axis defaults
  if (rows && Array.isArray(rows)) {
    const installedIds = new Set(
      rows.filter((r) => r.status === "installed").map((r) => r.addon_id),
    );

    for (const manifest of ADDON_MANIFESTS) {
      if (!installedIds.has(manifest.id)) continue;
      if (manifest.contributions.variantAxisDefaults) {
        Object.assign(out, manifest.contributions.variantAxisDefaults);
      }
    }
  }

  return out;
}

export function customFieldPresetsFrom(
  rows: BrandAddonRow[] | null | undefined,
): Array<{ key: string; label: { ar: string; en: string }; fields: unknown[] }> {
  if (!rows || !Array.isArray(rows)) return [];
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const presets: Array<{
    key: string;
    label: { ar: string; en: string };
    fields: unknown[];
  }> = [];

  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.customFieldPresets) {
      presets.push(...manifest.contributions.customFieldPresets);
    }
  }

  return presets;
}

export function sizingPresetsFrom(rows: BrandAddonRow[] | null | undefined): SizingPreset[] {
  if (!rows || !Array.isArray(rows)) return [];
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const presets: SizingPreset[] = [];
  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.sizingPresets) {
      presets.push(...manifest.contributions.sizingPresets);
    }
  }

  return presets;
}

export function readinessChecksFrom(
  rows: BrandAddonRow[] | null | undefined,
): AddonReadinessCheck[] {
  if (!rows || !Array.isArray(rows)) return [];
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const checks: AddonReadinessCheck[] = [];
  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.readinessChecks) {
      checks.push(...manifest.contributions.readinessChecks);
    }
  }

  return checks;
}

export function productionStagesFrom(rows: BrandAddonRow[] | null | undefined): boolean {
  if (!rows || !Array.isArray(rows)) return false;
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.productionStages) {
      return true;
    }
  }

  return false;
}

export function trustBadgeSuggestionsFrom(rows: BrandAddonRow[] | null | undefined): string[] {
  if (!rows || !Array.isArray(rows)) return [];
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const suggestions: string[] = [];
  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.trustBadgeSuggestions) {
      suggestions.push(...manifest.contributions.trustBadgeSuggestions);
    }
  }

  return Array.from(new Set(suggestions));
}

export function sizingPresetOrderFrom(rows: BrandAddonRow[] | null | undefined): string[] {
  if (!rows || !Array.isArray(rows)) return [];
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const candidates: AddonManifest[] = [];
  for (const manifest of ADDON_MANIFESTS) {
    if (installedIds.has(manifest.id) && manifest.contributions.sizingPresetOrder) {
      candidates.push(manifest);
    }
  }

  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates[0].contributions.sizingPresetOrder!;

  // If multiple candidates, pick the most specific one (one that requires others)
  candidates.sort((a, b) => {
    const aRequiresB = a.requires?.includes(b.id) ? 1 : 0;
    const bRequiresA = b.requires?.includes(a.id) ? 1 : 0;
    if (aRequiresB !== bRequiresA) return bRequiresA - aRequiresB;
    return (b.requires?.length || 0) - (a.requires?.length || 0);
  });

  return candidates[0].contributions.sizingPresetOrder!;
}

export interface VariantAxisConfig {
  label: string;
  visible: boolean;
  isCustom: boolean;
}

export interface ProductVariantLabels {
  variant_label_size_ar?: string | null;
  variant_label_size_en?: string | null;
  variant_label_color_ar?: string | null;
  variant_label_color_en?: string | null;
  variant_label_fabric_ar?: string | null;
  variant_label_fabric_en?: string | null;
  variant_label_four_ar?: string | null;
  variant_label_four_en?: string | null;
  variant_label_five_ar?: string | null;
  variant_label_five_en?: string | null;
}

export const GENERIC_AXIS_DEFAULTS = {
  size: { ar: "المقاس / خيار", en: "Size / Option" },
  color: { ar: "اللون", en: "Color" },
  fabric: { ar: "الخامة", en: "Fabric" },
  four: { ar: "خاصية إضافية 1", en: "Option 4" },
  five: { ar: "خاصية إضافية 2", en: "Option 5" },
} as const;

export type VariantAxisKey = "size" | "color" | "fabric" | "four" | "five";

export function resolveVariantAxis({
  axis,
  product,
  addonDefaults,
  lang,
}: {
  axis: VariantAxisKey;
  product?: ProductVariantLabels | null;
  addonDefaults?: {
    size?: { ar: string; en: string } | null;
    color?: { ar: string; en: string } | null;
    fabric?: { ar: string; en: string } | null;
    four?: { ar: string; en: string } | null;
    five?: { ar: string; en: string } | null;
  };
  lang: "ar" | "en";
}): VariantAxisConfig {
  const customAr = (product as any)?.[`variant_label_${axis}_ar`]?.trim();
  const customEn = (product as any)?.[`variant_label_${axis}_en`]?.trim();
  const custom = lang === "ar" ? customAr || customEn : customEn || customAr;

  if (custom) {
    return {
      label: custom,
      visible: true,
      isCustom: true,
    };
  }

  // Axes 'four' and 'five' are disabled by default unless custom label is set on product
  if (axis === "four" || axis === "five") {
    const addonAxis = addonDefaults?.[axis];
    if (addonAxis) {
      return {
        label: addonAxis[lang] || addonAxis.en || addonAxis.ar,
        visible: true,
        isCustom: false,
      };
    }
    return {
      label: GENERIC_AXIS_DEFAULTS[axis][lang],
      visible: false,
      isCustom: false,
    };
  }

  const addonAxis = addonDefaults?.[axis];
  if (addonAxis === null) {
    // Explicit null hides the axis unless custom label was set on product
    return {
      label: GENERIC_AXIS_DEFAULTS[axis][lang],
      visible: false,
      isCustom: false,
    };
  }

  if (addonAxis) {
    return {
      label: addonAxis[lang] || addonAxis.en || addonAxis.ar,
      visible: true,
      isCustom: false,
    };
  }

  // General vanilla fallback
  return {
    label: GENERIC_AXIS_DEFAULTS[axis][lang],
    visible: true,
    isCustom: false,
  };
}

export function resolveAllVariantAxes({
  product,
  addonDefaults,
  lang,
}: {
  product?: ProductVariantLabels | null;
  addonDefaults?: {
    size?: { ar: string; en: string } | null;
    color?: { ar: string; en: string } | null;
    fabric?: { ar: string; en: string } | null;
    four?: { ar: string; en: string } | null;
    five?: { ar: string; en: string } | null;
  };
  lang: "ar" | "en";
}): Record<VariantAxisKey, VariantAxisConfig> {
  return {
    size: resolveVariantAxis({ axis: "size", product, addonDefaults, lang }),
    color: resolveVariantAxis({ axis: "color", product, addonDefaults, lang }),
    fabric: resolveVariantAxis({ axis: "fabric", product, addonDefaults, lang }),
    four: resolveVariantAxis({ axis: "four", product, addonDefaults, lang }),
    five: resolveVariantAxis({ axis: "five", product, addonDefaults, lang }),
  };
}

export function resolveItemAllVariantLabels({
  product,
  brandAddons,
  addonDefaults,
  storeVertical,
  lang,
}: {
  product?: ProductVariantLabels | null;
  brandAddons?: BrandAddonRow[] | null;
  addonDefaults?: {
    size?: { ar: string; en: string } | null;
    color?: { ar: string; en: string } | null;
    fabric?: { ar: string; en: string } | null;
  } | null;
  storeVertical?: string | null;
  lang: "ar" | "en";
}): Record<"size" | "color" | "fabric", string> {
  const defaults = addonDefaults ?? variantAxisDefaultsFrom(brandAddons, storeVertical);
  const axes = resolveAllVariantAxes({ product, addonDefaults: defaults, lang });
  return {
    size: axes.size.label,
    color: axes.color.label,
    fabric: axes.fabric.label,
  };
}
