import { describe, it, expect, vi } from "vitest";
import {
  syncPackagingExpensesToInventory,
  syncSingleExpenseToPackagingMaterial,
} from "../src/lib/packaging-sync";

describe("Packaging Expenses to Inventory Auto-Sync", () => {
  it("synchronizes existing packaging expenses into packaging_materials table", async () => {
    const mockPackagingMaterials: any[] = [];
    const mockExpenses = [
      {
        id: "exp-1",
        brand_id: "brand-1",
        description: "اكياس كبيرة",
        category: "Packaging",
        expense_type: "cogs",
        quantity: 100,
        amount: 38.75,
        unit_cost: 0.388,
      },
      {
        id: "exp-2",
        brand_id: "brand-1",
        description: "بطاقات تسعير",
        category: "Packaging",
        expense_type: "cogs",
        quantity: 100,
        amount: 12.1,
        unit_cost: 0.121,
      },
      {
        id: "exp-3",
        brand_id: "brand-1",
        description: "اكياس بلاستيكية",
        category: "Packaging",
        expense_type: "cogs",
        quantity: 50,
        amount: 3.1,
        unit_cost: 0.062,
      },
    ];

    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => {
            if (table === "packaging_materials") {
              return Promise.resolve({ data: mockPackagingMaterials, error: null });
            }
            if (table === "expenses") {
              return Promise.resolve({ data: mockExpenses, error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }),
        insert: (payload: any) => {
          mockPackagingMaterials.push({ id: `mat-${Date.now()}`, ...payload });
          return Promise.resolve({ error: null });
        },
        update: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      }),
    };

    const res = await syncPackagingExpensesToInventory(mockSupabase, "brand-1");
    expect(res.createdCount).toBe(3);
    expect(mockPackagingMaterials.length).toBe(3);
    expect(mockPackagingMaterials[0].name).toBe("اكياس كبيرة");
    expect(mockPackagingMaterials[0].stock_quantity).toBe(100);
    expect(mockPackagingMaterials[0].unit_cost).toBe(0.388);
    expect(mockPackagingMaterials[1].name).toBe("بطاقات تسعير");
    expect(mockPackagingMaterials[1].stock_quantity).toBe(100);
    expect(mockPackagingMaterials[1].unit_cost).toBe(0.121);
    expect(mockPackagingMaterials[2].name).toBe("اكياس بلاستيكية");
    expect(mockPackagingMaterials[2].stock_quantity).toBe(50);
    expect(mockPackagingMaterials[2].unit_cost).toBe(0.062);
  });

  it("syncs a single new packaging expense when saved in Expenses tab", async () => {
    const mockMaterials: any[] = [];
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: mockMaterials, error: null }),
        }),
        insert: (payload: any) => {
          mockMaterials.push(payload);
          return Promise.resolve({ error: null });
        },
      }),
    };

    const success = await syncSingleExpenseToPackagingMaterial(mockSupabase, "brand-1", {
      description: "كرتون شحن كبير",
      category: "Packaging",
      expense_type: "cogs",
      quantity: 200,
      amount: 50.0,
      unit_cost: 0.25,
    });

    expect(success).toBe(true);
    expect(mockMaterials.length).toBe(1);
    expect(mockMaterials[0].name).toBe("كرتون شحن كبير");
    expect(mockMaterials[0].stock_quantity).toBe(200);
    expect(mockMaterials[0].unit_cost).toBe(0.25);
  });
});
