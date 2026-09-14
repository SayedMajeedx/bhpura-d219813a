import { describe, expect, test } from "vitest";
import { abayaPackManifest } from "../src/addons/abaya-pack/manifest";
import { beautyPerfumeManifest } from "../src/addons/beauty-perfume/manifest";
import { foodBeverageManifest } from "../src/addons/food-beverage/manifest";
import { giftsManifest } from "../src/addons/gifts/manifest";
import { jewelryManifest } from "../src/addons/jewelry/manifest";
import { printStampsManifest } from "../src/addons/print-stamps/manifest";
import { withThrowOnError, resolveBrandOwnerUserId } from "../src/lib/addons/seed-helpers";
import { getAllAddons } from "../src/lib/addons/addon-registry";

// In-memory mock database enforcing PostgreSQL migration constraints
function createMockDb(initialState?: {
  brands?: any[];
  businessSettings?: any[];
  sizeGuides?: any[];
  categories?: any[];
  customizationOptions?: any[];
}) {
  const brands = [...(initialState?.brands || [])];
  const businessSettings = [...(initialState?.businessSettings || [])];
  const sizeGuides = [...(initialState?.sizeGuides || [])];
  const categories = [...(initialState?.categories || [])];
  const customizationOptions = [...(initialState?.customizationOptions || [])];

  const db = {
    _state: {
      brands,
      businessSettings,
      sizeGuides,
      categories,
      customizationOptions,
    },
    from: (table: string) => {
      let filters: Array<{ col: string; val: any; isArray?: boolean }> = [];

      const queryBuilder = {
        select: (_cols?: string) => queryBuilder,
        eq: (col: string, val: any) => {
          filters.push({ col, val });
          return queryBuilder;
        },
        in: (col: string, val: any[]) => {
          filters.push({ col, val, isArray: true });
          return queryBuilder;
        },
        maybeSingle: async () => {
          const rows = getFilteredRows();
          return { data: rows.length > 0 ? rows[0] : null, error: null };
        },
        single: async () => {
          const rows = getFilteredRows();
          if (rows.length === 0) {
            return { data: null, error: { message: "Row not found", code: "PGRST116" } };
          }
          return { data: rows[0], error: null };
        },
        insert: async (data: any) => {
          const rowsToInsert = Array.isArray(data) ? data : [data];
          for (const row of rowsToInsert) {
            validateSchemaConstraints(table, row);
            getTargetArray().push({ id: `mock-${Date.now()}-${Math.random()}`, ...row });
          }
          return { data: rowsToInsert, error: null };
        },
        update: (patch: any) => ({
          eq: async (col: string, val: any) => {
            filters.push({ col, val });
            const rows = getFilteredRows();
            for (const row of rows) {
              Object.assign(row, patch);
            }
            return { data: rows, error: null };
          },
        }),
      };

      function getTargetArray(): any[] {
        if (table === "brands") return brands;
        if (table === "business_settings") return businessSettings;
        if (table === "size_guides") return sizeGuides;
        if (table === "categories") return categories;
        if (table === "customization_options") return customizationOptions;
        throw new Error(`Unknown table: ${table}`);
      }

      function getFilteredRows(): any[] {
        let rows = getTargetArray();
        for (const f of filters) {
          if (f.isArray) {
            rows = rows.filter((r) => Array.isArray(f.val) && f.val.includes(r[f.col]));
          } else {
            rows = rows.filter((r) => r[f.col] === f.val);
          }
        }
        return rows;
      }

      function validateSchemaConstraints(tbl: string, row: any) {
        if (tbl === "size_guides") {
          // Check constraint from 20260916100000_size_guides.sql: CHECK (base_unit IN ('cm', 'in', 'none'))
          if (!["cm", "in", "none"].includes(row.base_unit)) {
            throw new Error(
              `size_guides CHECK constraint failed: base_unit must be 'cm', 'in', or 'none'. Got '${row.base_unit}'`,
            );
          }
        }
        if (tbl === "customization_options") {
          // Check constraint & foreign key on user_id
          if (!row.user_id || row.user_id === "00000000-0000-0000-0000-000000000000") {
            throw new Error(
              `customization_options foreign key constraint failed: user_id cannot be null or zero UUID. Got '${row.user_id}'`,
            );
          }
        }
      }

      return queryBuilder;
    },
  };

  return db;
}

describe("Addon Seeds Platform Integrity", () => {
  const brandId = "b1111111-1111-1111-1111-111111111111";
  const userId = "u2222222-2222-2222-2222-222222222222";

  test("Every addon seed in the registry is tested and valid", () => {
    const addons = getAllAddons();
    const addonsWithSeeds = addons.filter((a) => a.seeds && a.seeds.length > 0);
    const manifests = [
      abayaPackManifest,
      beautyPerfumeManifest,
      foodBeverageManifest,
      giftsManifest,
      jewelryManifest,
      printStampsManifest,
    ];

    expect(addonsWithSeeds.map((a) => a.id).sort()).toEqual(manifests.map((m) => m.id).sort());
  });

  describe("abaya-pack seeds", () => {
    test("abaya_default_guide adheres to size_guides schema and is idempotent", async () => {
      const db = createMockDb();
      const seed = abayaPackManifest.seeds!.find((s) => s.key === "abaya_default_guide")!;

      // First run
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.sizeGuides.length).toBe(1);
      const guide = db._state.sizeGuides[0];
      expect(guide.template_key).toBe("abaya_gulf");
      expect(guide.base_unit).toBe("in"); // Valid base_unit constraint
      expect(guide.is_default).toBe(true);

      // Second run (idempotency check)
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.sizeGuides.length).toBe(1);
    });

    test("abaya_fit_profiles updates business_settings idempotently", async () => {
      const db = createMockDb({
        businessSettings: [{ brand_id: brandId, fit_profiles: null }],
      });
      const seed = abayaPackManifest.seeds!.find((s) => s.key === "abaya_fit_profiles")!;

      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.businessSettings[0].fit_profiles).toBeDefined();

      const savedProfiles = db._state.businessSettings[0].fit_profiles;
      // Second run should keep existing profiles
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.businessSettings[0].fit_profiles).toBe(savedProfiles);
    });
  });

  describe("beauty-perfume seeds", () => {
    test("beauty_default_categories inserts 3 categories idempotently", async () => {
      const db = createMockDb();
      const seed = beautyPerfumeManifest.seeds!.find((s) => s.key === "beauty_default_categories")!;

      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.categories.length).toBe(3);
      expect(db._state.categories.map((c) => c.slug)).toEqual([
        "women-perfumes",
        "men-perfumes",
        "oud-incense",
      ]);

      // Second run
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.categories.length).toBe(3);
    });
  });

  describe("food-beverage seeds", () => {
    test("skips gracefully when brand owner cannot be resolved", async () => {
      const db = createMockDb(); // No brands or business_settings
      const seed = foodBeverageManifest.seeds!.find((s) => s.key === "food_extras_customization")!;

      // Should not throw and should not insert zero UUID
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(0);
    });

    test("inserts customization option when brand owner exists and is idempotent", async () => {
      const db = createMockDb({
        brands: [{ id: brandId, created_by: userId }],
      });
      const seed = foodBeverageManifest.seeds!.find((s) => s.key === "food_extras_customization")!;

      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
      expect(db._state.customizationOptions[0].user_id).toBe(userId);

      // Second run
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
    });
  });

  describe("gifts seeds", () => {
    test("skips gracefully when brand owner cannot be resolved", async () => {
      const db = createMockDb();
      const seed = giftsManifest.seeds!.find((s) => s.key === "gift_wrapping_options")!;

      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(0);
    });

    test("inserts customization option when brand owner exists and is idempotent", async () => {
      const db = createMockDb({
        brands: [{ id: brandId, created_by: userId }],
      });
      const seed = giftsManifest.seeds!.find((s) => s.key === "gift_wrapping_options")!;

      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
      expect(db._state.customizationOptions[0].user_id).toBe(userId);

      // Second run
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
    });
  });

  describe("jewelry seeds", () => {
    test("jewelry_ring_guide satisfies base_unit constraint ('none') and is idempotent", async () => {
      const db = createMockDb();
      const seed = jewelryManifest.seeds!.find((s) => s.key === "jewelry_ring_guide")!;

      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.sizeGuides.length).toBe(1);
      const guide = db._state.sizeGuides[0];
      expect(guide.template_key).toBe("rings");
      expect(guide.base_unit).toBe("none"); // Satisfies CHECK (base_unit IN ('cm', 'in', 'none'))
      expect(guide.columns).toBeDefined();
      expect(guide.rows.length).toBeGreaterThan(0);

      // Second run
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.sizeGuides.length).toBe(1);
    });

    test("jewelry_engraving_option skips when no owner and inserts when owner exists", async () => {
      const db = createMockDb();
      const seed = jewelryManifest.seeds!.find((s) => s.key === "jewelry_engraving_option")!;

      // No owner -> skip
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(0);

      // Owner exists -> insert
      db._state.brands.push({ id: brandId, created_by: userId });
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
      expect(db._state.customizationOptions[0].user_id).toBe(userId);

      // Second run
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
    });
  });

  describe("print-stamps seeds", () => {
    test("print_stamps_customization skips when no owner and inserts when owner exists", async () => {
      const db = createMockDb();
      const seed = printStampsManifest.seeds!.find((s) => s.key === "print_stamps_customization")!;

      // No owner -> skip
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(0);

      // Owner exists via business_settings -> insert
      db._state.businessSettings.push({ brand_id: brandId, user_id: userId });
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
      expect(db._state.customizationOptions[0].user_id).toBe(userId);

      // Second run
      await seed.run({ brandId, db: withThrowOnError(db) as any, lang: "ar", settings: {} });
      expect(db._state.customizationOptions.length).toBe(1);
    });
  });

  describe("seed-helpers: resolveBrandOwnerUserId & withThrowOnError", () => {
    test("resolveBrandOwnerUserId checks created_by first, then business_settings.user_id", async () => {
      const db = createMockDb({
        brands: [{ id: brandId, created_by: "u-owner-1" }],
        businessSettings: [{ brand_id: brandId, user_id: "u-bs-2" }],
      });

      const owner = await resolveBrandOwnerUserId(db as any, brandId);
      expect(owner).toBe("u-owner-1");
    });

    test("resolveBrandOwnerUserId falls back to business_settings.user_id if brands.created_by is null", async () => {
      const db = createMockDb({
        brands: [{ id: brandId, created_by: null }],
        businessSettings: [{ brand_id: brandId, user_id: "u-bs-2" }],
      });

      const owner = await resolveBrandOwnerUserId(db as any, brandId);
      expect(owner).toBe("u-bs-2");
    });

    test("withThrowOnError proxy interceptor throws when error is returned in response", async () => {
      const mockClientWithError = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: new Error("Simulated PostgreSQL connection failure"),
              }),
            }),
          }),
        }),
      };

      const proxied = withThrowOnError(mockClientWithError);
      await expect(proxied.from("brands").select().eq("id", "123").maybeSingle()).rejects.toThrow(
        "Simulated PostgreSQL connection failure",
      );
    });
  });
});
