import { describe, expect, test, vi } from "vitest";
import { abayaPackManifest } from "../src/addons/abaya-pack/manifest";

describe("Addon Idempotent Seeds", () => {
  test("abaya_default_guide seed inserts size guide on first run and skips on second run", async () => {
    const seed = abayaPackManifest.seeds?.find((s) => s.key === "abaya_default_guide");
    expect(seed).toBeDefined();

    const insertedRows: any[] = [];
    let mockExistingGuide: any = null;

    const mockDb = {
      from: (table: string) => {
        if (table === "size_guides") {
          return {
            select: () => ({
              eq: (_col1: string, _val1: any) => ({
                eq: (_col2: string, _val2: any) => ({
                  maybeSingle: async () => ({
                    data: mockExistingGuide,
                    error: null,
                  }),
                }),
              }),
            }),
            insert: async (row: any) => {
              insertedRows.push(row);
              mockExistingGuide = { id: "guide-1", ...row };
              return { data: row, error: null };
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    // First execution
    await seed!.run({
      brandId: "brand-123",
      db: mockDb as any,
      lang: "ar",
      settings: {},
    });

    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].template_key).toBe("abaya_gulf");
    expect(insertedRows[0].brand_id).toBe("brand-123");

    // Second execution on same brand
    await seed!.run({
      brandId: "brand-123",
      db: mockDb as any,
      lang: "ar",
      settings: {},
    });

    // Still only 1 row inserted (idempotency verified!)
    expect(insertedRows.length).toBe(1);
  });

  test("abaya_fit_profiles seed updates settings only if not already configured", async () => {
    const seed = abayaPackManifest.seeds?.find((s) => s.key === "abaya_fit_profiles");
    expect(seed).toBeDefined();

    let settingsRow: any = { fit_profiles: null };
    const updates: any[] = [];

    const mockDb = {
      from: (table: string) => {
        if (table === "business_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: settingsRow,
                  error: null,
                }),
              }),
            }),
            update: (patch: any) => ({
              eq: () => {
                updates.push(patch);
                settingsRow = { ...settingsRow, ...patch };
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    // First execution: updates fit_profiles
    await seed!.run({
      brandId: "brand-123",
      db: mockDb as any,
      lang: "ar",
      settings: {},
    });

    expect(updates.length).toBe(1);
    expect(updates[0].fit_profiles).toBeDefined();

    // Second execution: skips because fit_profiles already exists
    await seed!.run({
      brandId: "brand-123",
      db: mockDb as any,
      lang: "ar",
      settings: {},
    });

    expect(updates.length).toBe(1);
  });

  test("seeded_keys tracking prevents redundant execution of seeds", async () => {
    const executedKeys: string[] = [];
    const seededKeys = new Set<string>();

    const runSeedMock = vi.fn(async (key: string) => {
      executedKeys.push(key);
      seededKeys.add(key);
    });

    const seeds = [{ key: "seed_1" }, { key: "seed_2" }];

    // First pass
    for (const s of seeds) {
      if (!seededKeys.has(s.key)) {
        await runSeedMock(s.key);
      }
    }

    expect(executedKeys).toEqual(["seed_1", "seed_2"]);
    expect(runSeedMock).toHaveBeenCalledTimes(2);

    // Second pass: both keys already in seededKeys
    for (const s of seeds) {
      if (!seededKeys.has(s.key)) {
        await runSeedMock(s.key);
      }
    }

    expect(runSeedMock).toHaveBeenCalledTimes(2);
    expect(executedKeys.length).toBe(2);
  });
});
