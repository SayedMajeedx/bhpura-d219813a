import { ADDON_MANIFESTS } from "@/addons/registry";
import type {
  AddonId,
  AddonManifest,
  AddonSettingsField,
  BrandAddonRow,
  SlotComponent,
  SlotPlacement,
  StoreVocabulary,
} from "./addon-types";
import type { StoreVertical } from "@/lib/store-profile";

export type { AddonManifest, AddonSettingsField };

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

    // Unique slot ids across all slots
    if (manifest.contributions.slots) {
      for (const slot of manifest.contributions.slots) {
        if (seenSlotIds.has(slot.id)) {
          errors.push(`Duplicate slot id found: "${slot.id}" in addon "${manifest.id}"`);
        }
        seenSlotIds.add(slot.id);
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

export function starterPackFor(activity: StoreVertical): {
  required: AddonId[];
  suggested: AddonId[];
} {
  switch (activity) {
    case "abayas":
      return {
        required: ["fashion-core", "size-guides", "fit-passport", "made-to-order", "abaya-pack"],
        suggested: [],
      };
    case "fashion":
      return {
        required: ["fashion-core", "size-guides", "fit-passport", "made-to-order"],
        suggested: [],
      };
    case "beauty":
      return {
        required: ["beauty-perfume"],
        suggested: [],
      };
    case "food":
      return {
        required: ["food-beverage"],
        suggested: ["made-to-order"],
      };
    case "digital":
      return {
        required: ["digital-products"],
        suggested: [],
      };
    case "gifts":
      return {
        required: ["gifts"],
        suggested: [],
      };
    case "print":
      return {
        required: ["made-to-order", "print-stamps"],
        suggested: [],
      };
    case "jewelry":
      return {
        required: ["size-guides", "made-to-order", "jewelry"],
        suggested: [],
      };
    case "home":
    case "electronics":
    case "general":
    default:
      return {
        required: [],
        suggested: [],
      };
  }
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

export function variantAxisDefaultsFrom(rows: BrandAddonRow[] | null | undefined): {
  size?: { ar: string; en: string } | null;
  color?: { ar: string; en: string } | null;
  fabric?: { ar: string; en: string } | null;
} {
  if (!rows || !Array.isArray(rows)) return {};
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  const out: {
    size?: { ar: string; en: string } | null;
    color?: { ar: string; en: string } | null;
    fabric?: { ar: string; en: string } | null;
  } = {};

  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.variantAxisDefaults) {
      Object.assign(out, manifest.contributions.variantAxisDefaults);
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

export function sizingPresetOrderFrom(rows: BrandAddonRow[] | null | undefined): string[] {
  if (!rows || !Array.isArray(rows)) return [];
  const installedIds = new Set(rows.filter((r) => r.status === "installed").map((r) => r.addon_id));

  for (const manifest of ADDON_MANIFESTS) {
    if (!installedIds.has(manifest.id)) continue;
    if (manifest.contributions.sizingPresetOrder) {
      return manifest.contributions.sizingPresetOrder;
    }
  }

  return [];
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
}

export const GENERIC_AXIS_DEFAULTS = {
  size: { ar: "المقاس / خيار", en: "Size / Option" },
  color: { ar: "اللون", en: "Color" },
  fabric: { ar: "الخامة", en: "Fabric" },
} as const;

export function resolveVariantAxis({
  axis,
  product,
  addonDefaults,
  lang,
}: {
  axis: "size" | "color" | "fabric";
  product?: ProductVariantLabels | null;
  addonDefaults?: {
    size?: { ar: string; en: string } | null;
    color?: { ar: string; en: string } | null;
    fabric?: { ar: string; en: string } | null;
  };
  lang: "ar" | "en";
}): VariantAxisConfig {
  const customAr = (product as any)?.[`variant_label_${axis}_ar`]?.trim();
  const customEn = (product as any)?.[`variant_label_${axis}_en`]?.trim();
  const custom = lang === "ar" ? (customAr || customEn) : (customEn || customAr);

  if (custom) {
    return {
      label: custom,
      visible: true,
      isCustom: true,
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
  };
  lang: "ar" | "en";
}): Record<"size" | "color" | "fabric", VariantAxisConfig> {
  return {
    size: resolveVariantAxis({ axis: "size", product, addonDefaults, lang }),
    color: resolveVariantAxis({ axis: "color", product, addonDefaults, lang }),
    fabric: resolveVariantAxis({ axis: "fabric", product, addonDefaults, lang }),
  };
}

