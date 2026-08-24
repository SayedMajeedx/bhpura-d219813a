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
  id?: string;
  brand_id: string;
  product_id: string;
  packaging_material_id: string;
  quantity_per_unit: number;
  packaging_material?: PackagingMaterial;
  packaging_materials?: PackagingMaterial;
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
    const mat = item.packaging_material || item.packaging_materials;
    const unitCost = Number(mat?.unit_cost || 0);
    const qty = Number(item.quantity_per_unit || 1);
    return sum + unitCost * qty;
  }, 0);
  return Number((directCost + bomCost).toFixed(3));
}

/**
 * Match a product from list given an item's product_id, variant_id, or description.
 */
export function matchProductForItem(
  item: { product_id?: string | null; variant_id?: string | null; description?: string | null },
  products: any[] = [],
  variants: any[] = [],
): any | null {
  if (!item) return null;

  // 1. Direct product_id match
  if (item.product_id) {
    const p = products.find((x) => x.id === item.product_id);
    if (p) return p;
  }

  // 2. Match via variant_id
  if (item.variant_id) {
    const v = variants.find((x) => x.id === item.variant_id);
    if (v && v.product_id) {
      const p = products.find((x) => x.id === v.product_id);
      if (p) return p;
    }
  }

  // 3. Fallback fuzzy match by description
  if (item.description) {
    const desc = String(item.description).trim().toLowerCase();
    const p = products.find((x) => {
      const name = String(x.name || "")
        .trim()
        .toLowerCase();
      const nameAr = String(x.name_ar || "")
        .trim()
        .toLowerCase();
      return (
        (name && (desc.includes(name) || name.includes(desc))) ||
        (nameAr && (desc.includes(nameAr) || nameAr.includes(desc)))
      );
    });
    if (p) return p;
  }

  return null;
}

/**
 * Calculate packaging cost for a single order item.
 */
export function getItemPackagingCost(
  item: any,
  products: any[] = [],
  variants: any[] = [],
  bomItems: any[] = [],
  packagingMaterials: any[] = [],
): number {
  if (!item) return 0;

  // If item already has a non-zero explicit packaging_cost property attached
  if (
    item.packaging_cost != null &&
    !isNaN(Number(item.packaging_cost)) &&
    Number(item.packaging_cost) > 0
  ) {
    return Number(Number(item.packaging_cost).toFixed(3));
  }

  const product = matchProductForItem(item, products, variants);
  if (!product) {
    return 0;
  }

  // Find product's BOM items
  const attachedBoms = bomItems.filter((b) => b.product_id === product.id);
  const directCost = Number(product.direct_packaging_cost || 0);

  if (attachedBoms.length > 0) {
    const bomCost = attachedBoms.reduce((sum, b) => {
      const mat =
        b.packaging_material ||
        b.packaging_materials ||
        packagingMaterials.find((m) => m.id === b.packaging_material_id);
      const unitCost = Number(mat?.unit_cost || 0);
      const qty = Number(b.quantity_per_unit || 1);
      return sum + unitCost * qty;
    }, 0);
    return Number((directCost + bomCost).toFixed(3));
  }

  if (directCost > 0) {
    return Number(directCost.toFixed(3));
  }

  return 0;
}

/**
 * Calculate total packaging COGS for an entire order.
 */
export function calculateOrderPackagingCogs(
  items: any[] = [],
  isFulfilled: boolean,
  products: any[] = [],
  variants: any[] = [],
  bomItems: any[] = [],
  packagingMaterials: any[] = [],
): number {
  if (!isFulfilled || !items || items.length === 0) return 0;

  const total = items.reduce((sum, it) => {
    const qty = Number(it.quantity || it.qty || 1);
    const unitPkgCost = getItemPackagingCost(it, products, variants, bomItems, packagingMaterials);
    return sum + unitPkgCost * qty;
  }, 0);

  return Number(total.toFixed(3));
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
    if (!productId || !brandId || quantitySold <= 0) return { success: true };

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
