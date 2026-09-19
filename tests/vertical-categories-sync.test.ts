import { describe, it, expect, vi } from "vitest";
import {
  syncBrandVerticalCategories,
  DEFAULT_VERTICAL_CATEGORIES,
  PURA_BRAND_ID,
} from "../src/lib/addons/vertical-categories";
import { STORE_VERTICALS } from "../src/lib/store-profile";

describe("Vertical Categories Synchronization & Invariants", () => {
  it("defines default categories for all known store verticals", () => {
    for (const vertical of STORE_VERTICALS) {
      const defaults = DEFAULT_VERTICAL_CATEGORIES[vertical];
      expect(
        Array.isArray(defaults) && defaults.length > 0,
        `Vertical '${vertical}' must have default categories defined`,
      ).toBe(true);

      for (const cat of defaults) {
        expect(cat.name_ar.trim().length).toBeGreaterThan(0);
        expect(cat.name_en.trim().length).toBeGreaterThan(0);
        expect(cat.slug.trim().length).toBeGreaterThan(0);
        expect(cat.sort_order).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("strictly aborts and protects PURA brand from any category modifications", async () => {
    const mockDb: any = {
      from: vi.fn(),
    };

    const result = await syncBrandVerticalCategories({
      db: mockDb,
      brandId: PURA_BRAND_ID,
      newVertical: "food",
      replaceEmptyOldCategories: true,
    });

    expect(result).toEqual({
      insertedCount: 0,
      removedCount: 0,
      skipped: true,
      reason: "pura_protected",
    });
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it("safely syncs categories for non-pura brand, preserving categories with products", async () => {
    const fakeBrandId = "11111111-2222-3333-4444-555555555555";
    const existingCategories = [
      { id: "c1", slug: "women-perfumes", name_en: "Women's Perfumes" },
      { id: "c2", slug: "old-empty-perfumes", name_en: "Old Empty" },
    ];

    // Products: 1 product is in c1 ("women-perfumes")
    const existingProducts = [
      { id: "p1", category: "women-perfumes" },
    ];

    const deletedIds: string[] = [];
    const insertedRows: any[] = [];

    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === "categories") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: existingCategories,
                error: null,
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(async (_col: string, ids: string[]) => {
                  deletedIds.push(...ids);
                  return { error: null };
                }),
              })),
            })),
            insert: vi.fn(async (rows: any) => {
              const arr = Array.isArray(rows) ? rows : [rows];
              insertedRows.push(...arr);
              return { error: null };
            }),
          };
        }
        if (table === "products") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(async () => ({
                  data: existingProducts,
                  error: null,
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };

    const res = await syncBrandVerticalCategories({
      db: mockDb,
      brandId: fakeBrandId,
      newVertical: "food",
      replaceEmptyOldCategories: true,
    });

    // c2 should be removed because it has 0 products
    expect(deletedIds).toContain("c2");
    // c1 must NOT be deleted because p1 is assigned to it!
    expect(deletedIds).not.toContain("c1");

    // Food categories should be inserted
    expect(res.insertedCount).toBe(DEFAULT_VERTICAL_CATEGORIES.food.length);
    expect(res.removedCount).toBe(1);
  });
});
