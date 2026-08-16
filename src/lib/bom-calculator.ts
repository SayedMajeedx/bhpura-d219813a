import { supabase } from "@/integrations/supabase/client";

export interface PackagingMaterial {
  id: string;
  brand_id: string;
  name: string;
  name_ar?: string | null;
  sku?: string | null;
  stock_quantity: number;
  unit_cost: number;
  reorder_level?: number | null;
}

export interface ProductBomItem {
  id: string;
  brand_id: string;
  product_id: string;
  packaging_material_id: string;
  quantity_per_unit: number;
  packaging_material?: PackagingMaterial;
}

/**
  * Calculate total packaging cost for a product/variant:
  * Sum of (packaging_material.unit_cost * bom_item.quantity_per_unit)
  * plus product.direct_packaging_cost as fallback/addon.
  */
export function calculateProductPackagingCost(
  directPackagingCost: number | null | undefined,
  bomItems: ProductBomItem[] = [],
): number {
  const directCost = Number(directPackagingCost || 0);
  const bomCost = bomItems.reduce((sum, item) => {
    const unitCost = Number(item.packaging_material?.unit_cost || 0);
    const qty = Number(item.quantity_per_unit || 1);
    return sum + unitCost * qty;
  }, 0);
  return Number((directCost + bomCost).toFixed(3));
}

/**
  * Automatically deduct packaging stock when an order is completed.
  */
export async function deductOrderPackagingStock(
  brandId: string,
  productId: string,
  quantitySold: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Fetch BOM items attached to this product
    const { data: bomItems, error } = await (supabase as any)
      .from("product_bom_items")
      .select("packaging_material_id, quantity_per_unit, packaging_materials(id, stock_quantity)")
      .eq("product_id", productId)
      .eq("brand_id", brandId);

    if (error || !bomItems || bomItems.length === 0) {
      return { success: true }; // No attached BOM items
    }

    // 2. Deduct packaging material stock
    for (const item of bomItems) {
      const mat = item.packaging_materials as any;
      if (!mat) continue;
      const currentQty = Number(mat.stock_quantity || 0);
      const neededQty = Number(item.quantity_per_unit || 1) * quantitySold;
      const nextQty = Math.max(0, currentQty - neededQty);

      await (supabase as any)
        .from("packaging_materials")
        .update({ stock_quantity: nextQty } as any)
        .eq("id", mat.id)
        .eq("brand_id", brandId);
    }


    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to deduct packaging stock" };
  }
}
