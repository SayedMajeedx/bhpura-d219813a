import { describe, it, expect } from "vitest";
import { SETTINGS_REGISTRY, SETTINGS_GROUPS } from "../src/features/settings/registry";
import * as fs from "node:fs";
import * as path from "node:path";

function getBusinessSettingsColumnsFromTypes(): string[] {
  const typesPath = path.resolve(__dirname, "../src/integrations/supabase/types.ts");
  const content = fs.readFileSync(typesPath, "utf-8");

  // Locate the `business_settings: {` section and its `Row: { ... }` block
  const bsSectionMatch = content.match(/business_settings:\s*\{[\s\S]*?Row:\s*\{([\s\S]*?)\};/);
  if (!bsSectionMatch) {
    throw new Error("Could not find business_settings.Row in types.ts");
  }

  const rowBlock = bsSectionMatch[1];
  const columns: string[] = [];
  const lineRegex = /^\s*([a-zA-Z0-9_]+)\s*:/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(rowBlock)) !== null) {
    columns.push(match[1]);
  }

  return columns;
}

describe("Settings Registry Parity Guard", () => {
  const dbColumns = getBusinessSettingsColumnsFromTypes();
  const bsRegistryEntries = SETTINGS_REGISTRY.filter((f) => f.table === "business_settings");
  const bsRegistryKeys = bsRegistryEntries.map((f) => f.key);

  it("extracts all business_settings columns from types.ts correctly", () => {
    expect(dbColumns.length).toBeGreaterThan(150);
  });

  it("every business_settings column exists in the registry exactly once", () => {
    const keyCounts = new Map<string, number>();
    for (const key of bsRegistryKeys) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }

    const duplicates = Array.from(keyCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([key]) => key);

    expect(duplicates).toEqual([]);
  });

  it("no business_settings column from database types is missing from the registry", () => {
    const registrySet = new Set(bsRegistryKeys);
    const missing = dbColumns.filter((col) => !registrySet.has(col));
    expect(missing).toEqual([]);
  });

  it("no unknown business_settings columns exist in registry that are not in database types", () => {
    const dbSet = new Set(dbColumns);
    const extra = bsRegistryKeys.filter((col) => !dbSet.has(col));
    expect(extra).toEqual([]);
  });

  it("all fields with owner: 'settings' have valid tab and group", () => {
    const settingsOwned = SETTINGS_REGISTRY.filter((f) => f.owner === "settings");

    for (const field of settingsOwned) {
      expect(field.tab).not.toBeNull();
      expect(field.group).not.toBeNull();

      if (field.tab && field.group) {
        const tabGroups = SETTINGS_GROUPS[field.tab];
        expect(tabGroups).toBeDefined();

        const groupExists = tabGroups.some((g) => g.id === field.group);
        expect(
          groupExists,
          `Group "${field.group}" on field "${field.key}" does not exist in SETTINGS_GROUPS.${field.tab}`,
        ).toBe(true);
      }
    }
  });

  it("all fields with owner !== 'settings' have null tab and group", () => {
    const nonSettingsOwned = SETTINGS_REGISTRY.filter((f) => f.owner !== "settings");

    for (const field of nonSettingsOwned) {
      expect(
        field.tab,
        `Field "${field.key}" with owner "${field.owner}" must have tab: null`,
      ).toBeNull();
      expect(
        field.group,
        `Field "${field.key}" with owner "${field.owner}" must have group: null`,
      ).toBeNull();
    }
  });

  it("all fields have valid non-empty Arabic and English labels", () => {
    for (const field of SETTINGS_REGISTRY) {
      expect(field.label.ar.trim().length).toBeGreaterThan(0);
      expect(field.label.en.trim().length).toBeGreaterThan(0);
    }
  });

  it("basic settings count across owner: 'settings' is <= 45 (Owner Decision #7)", () => {
    const basicSettings = SETTINGS_REGISTRY.filter(
      (f) => f.owner === "settings" && f.level === "basic",
    );
    expect(basicSettings.length).toBeLessThanOrEqual(45);
  });

  it("every column with owner: 'settings' is referenced in src/features/settings", () => {
    function getAllFiles(dir: string, allFiles: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          getAllFiles(filePath, allFiles);
        } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
          allFiles.push(filePath);
        }
      }
      return allFiles;
    }

    const settingsDir = path.resolve(__dirname, "../src/features/settings");
    const allSettingsFiles = getAllFiles(settingsDir);
    const combinedCode = allSettingsFiles.map((f) => fs.readFileSync(f, "utf-8")).join("\n");

    const settingsOwned = SETTINGS_REGISTRY.filter((f) => f.owner === "settings");
    const unreferenced: string[] = [];

    for (const field of settingsOwned) {
      const regex = new RegExp(`\\b${field.key}\\b`);
      if (!regex.test(combinedCode)) {
        unreferenced.push(field.key);
      }
    }

    expect(
      unreferenced,
      `The following settings-owned keys are missing from src/features/settings: ${unreferenced.join(", ")}`,
    ).toEqual([]);
  });
});

