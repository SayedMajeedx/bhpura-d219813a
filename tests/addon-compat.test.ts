import { describe, it, expect } from "vitest";
import { modulesFromAddons } from "../src/lib/addons/addon-compat";
import type { BrandAddonRow } from "../src/lib/addons/addon-types";

describe("modulesFromAddons compatibility adapter", () => {
  it("translates installed addon rows to StoreModules shape", () => {
    const rows: BrandAddonRow[] = [
      {
        brand_id: "b1",
        addon_id: "size-guides",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "migration",
        installed_at: "2026-09-19T00:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
      },
      {
        brand_id: "b1",
        addon_id: "fit-passport",
        status: "disabled",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "migration",
        installed_at: "2026-09-19T00:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
      },
    ];

    const modules = modulesFromAddons(rows);
    expect(modules).toEqual({
      size_guide: true,
      fit_passport: false,
      made_to_order: false,
    });
  });

  it("handles empty or all-installed rows cleanly", () => {
    expect(modulesFromAddons([])).toEqual({
      size_guide: false,
      fit_passport: false,
      made_to_order: false,
    });

    const allRows: BrandAddonRow[] = [
      {
        brand_id: "b1",
        addon_id: "size-guides",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "migration",
        installed_at: "2026-09-19T00:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
      },
      {
        brand_id: "b1",
        addon_id: "fit-passport",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "migration",
        installed_at: "2026-09-19T00:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
      },
      {
        brand_id: "b1",
        addon_id: "made-to-order",
        status: "installed",
        version: 1,
        settings: {},
        public_settings: {},
        seeded_keys: [],
        source: "migration",
        installed_at: "2026-09-19T00:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
      },
    ];

    expect(modulesFromAddons(allRows)).toEqual({
      size_guide: true,
      fit_passport: true,
      made_to_order: true,
    });
  });
});
