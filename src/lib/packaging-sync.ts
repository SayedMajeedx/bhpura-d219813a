import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncResult {
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
}

/**
 * Normalizes text to compare material and expense names accurately.
 */
function normalizeName(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

/**
 * Synchronizes all packaging expenses (from expenses table) to packaging_materials table for a brand.
 */
export async function syncPackagingExpensesToInventory(
  supabase: SupabaseClient<any, any, any>,
  brandId: string,
): Promise<SyncResult> {
  if (!brandId) return { syncedCount: 0, createdCount: 0, updatedCount: 0 };

  try {
    // 1. Fetch existing packaging materials
    const { data: existingMaterials, error: matErr } = await (supabase as any)
      .from("packaging_materials")
      .select("*")
      .eq("brand_id", brandId);

    if (matErr) throw matErr;

    // 2. Fetch all expenses categorized under Packaging or COGS packaging
    const { data: expenses, error: expErr } = await (supabase as any)
      .from("expenses")
      .select("*")
      .eq("brand_id", brandId);

    if (expErr) throw expErr;

    const packagingExpenses = (expenses ?? []).filter((e: any) => {
      const cat = (e.category || "").toLowerCase();
      const desc = (e.description || "").toLowerCase();
      const isPkgCategory =
        cat.includes("packaging") ||
        cat.includes("تغليف") ||
        cat.includes("أكياس") ||
        cat.includes("علب");
      const isPkgDesc =
        desc.includes("أكياس") ||
        desc.includes("اكياس") ||
        desc.includes("كرتون") ||
        desc.includes("علب") ||
        desc.includes("بطاقات") ||
        desc.includes("تغليف") ||
        desc.includes("bag") ||
        desc.includes("box") ||
        desc.includes("packaging");
      return (
        (isPkgCategory || (e.expense_type === "cogs" && isPkgDesc)) && (e.description || "").trim()
      );
    });

    if (packagingExpenses.length === 0) {
      return { syncedCount: 0, createdCount: 0, updatedCount: 0 };
    }

    const existingList: any[] = existingMaterials ?? [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const exp of packagingExpenses) {
      const desc = (exp.description || "").trim();
      if (!desc) continue;

      const normDesc = normalizeName(desc);
      const match = existingList.find((m) => {
        const mName = normalizeName(m.name || "");
        const mNameAr = normalizeName(m.name_ar || "");
        return mName === normDesc || mNameAr === normDesc;
      });

      const qty = Number(exp.quantity) > 0 ? Number(exp.quantity) : 100;
      const amount = Number(exp.amount) || 0;
      const unitCost =
        Number(exp.unit_cost) > 0 ? Number(exp.unit_cost) : qty > 0 ? amount / qty : 0;

      if (!match) {
        // Insert new packaging material
        const { error: insErr } = await (supabase as any).from("packaging_materials").insert({
          brand_id: brandId,
          name: desc,
          name_ar: desc,
          stock_quantity: qty,
          unit_cost: Number(unitCost.toFixed(3)),
          reorder_level: 10,
        });

        if (!insErr) {
          createdCount += 1;
        }
      } else {
        // Update unit cost if missing or changed, and update stock if currently zero
        const needsCostUpdate = Number(match.unit_cost) <= 0 && unitCost > 0;
        const needsStockUpdate = Number(match.stock_quantity) <= 0 && qty > 0;

        if (needsCostUpdate || needsStockUpdate) {
          const patch: any = {};
          if (needsCostUpdate) patch.unit_cost = Number(unitCost.toFixed(3));
          if (needsStockUpdate) patch.stock_quantity = qty;

          await (supabase as any)
            .from("packaging_materials")
            .update(patch)
            .eq("id", match.id)
            .eq("brand_id", brandId);

          updatedCount += 1;
        }
      }
    }

    return {
      syncedCount: createdCount + updatedCount,
      createdCount,
      updatedCount,
    };
  } catch (err) {
    console.warn("[syncPackagingExpensesToInventory] Sync exception:", err);
    return { syncedCount: 0, createdCount: 0, updatedCount: 0 };
  }
}

/**
 * Sync a single expense directly to packaging_materials when created/updated.
 */
export async function syncSingleExpenseToPackagingMaterial(
  supabase: SupabaseClient<any, any, any>,
  brandId: string,
  expense: {
    description?: string | null;
    category?: string | null;
    expense_type?: string | null;
    quantity?: number | null;
    amount?: number | null;
    unit_cost?: number | null;
  },
): Promise<boolean> {
  if (!brandId || !expense.description?.trim()) return false;

  const cat = (expense.category || "").toLowerCase();
  const desc = expense.description.trim();
  const isPkg =
    cat.includes("packaging") ||
    cat.includes("تغليف") ||
    desc.includes("أكياس") ||
    desc.includes("اكياس") ||
    desc.includes("كرتون") ||
    desc.includes("علب") ||
    desc.includes("بطاقات") ||
    desc.includes("bag") ||
    desc.includes("box");

  if (!isPkg) return false;

  const qty = Number(expense.quantity) > 0 ? Number(expense.quantity) : 100;
  const amount = Number(expense.amount) || 0;
  const unitCost =
    Number(expense.unit_cost) > 0 ? Number(expense.unit_cost) : qty > 0 ? amount / qty : 0;

  try {
    const { data: existing } = await (supabase as any)
      .from("packaging_materials")
      .select("id, name, name_ar, stock_quantity, unit_cost")
      .eq("brand_id", brandId);

    const normDesc = normalizeName(desc);
    const match = (existing ?? []).find(
      (m: any) =>
        normalizeName(m.name || "") === normDesc || normalizeName(m.name_ar || "") === normDesc,
    );

    if (match) {
      await (supabase as any)
        .from("packaging_materials")
        .update({
          unit_cost: Number(unitCost.toFixed(3)),
          stock_quantity: Math.max(Number(match.stock_quantity || 0), qty),
        })
        .eq("id", match.id)
        .eq("brand_id", brandId);
    } else {
      await (supabase as any).from("packaging_materials").insert({
        brand_id: brandId,
        name: desc,
        name_ar: desc,
        stock_quantity: qty,
        unit_cost: Number(unitCost.toFixed(3)),
        reorder_level: 10,
      });
    }

    return true;
  } catch (err) {
    console.warn("[syncSingleExpenseToPackagingMaterial] Error:", err);
    return false;
  }
}
