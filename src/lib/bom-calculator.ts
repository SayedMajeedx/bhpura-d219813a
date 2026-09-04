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

  // 3. Fallback fuzzy match by description / code
  if (item.description) {
    const desc = String(item.description).trim().toLowerCase();
    const p = products.find((x) => {
      const name = String(x.name || "").trim().toLowerCase();
      const nameAr = String(x.name_ar || "").trim().toLowerCase();
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

  // 1. Completed orders carry an immutable snapshot
  if (
    item.packaging_cost_snapshot != null &&
    !isNaN(Number(item.packaging_cost_snapshot))
  ) {
    return Number(Number(item.packaging_cost_snapshot).toFixed(3));
  }

  // 2. Explicit packaging_cost property attached
  if (
    item.packaging_cost != null &&
    !isNaN(Number(item.packaging_cost)) &&
    Number(item.packaging_cost) > 0
  ) {
    return Number(Number(item.packaging_cost).toFixed(3));
  }

  const product = matchProductForItem(item, products, variants);
  if (!product) {
    // Fallback: If no catalog product matched (e.g. custom/manual line item),
    // calculate using the brand's configured packaging BOM materials.
    if (bomItems.length > 0) {
      const uniqueMatMap = new Map<string, number>();
      bomItems.forEach((b) => {
        const q = Number(b.quantity_per_unit || 1);
        const prev = uniqueMatMap.get(b.packaging_material_id) ?? 0;
        if (q > prev) uniqueMatMap.set(b.packaging_material_id, q);
      });
      const defaultCost = Array.from(uniqueMatMap.entries()).reduce((sum, [matId, qty]) => {
        const mat =
          packagingMaterials.find((m) => m.id === matId) ||
          bomItems.find((b) => b.packaging_material_id === matId)?.packaging_material ||
          bomItems.find((b) => b.packaging_material_id === matId)?.packaging_materials;
        return sum + Number(mat?.unit_cost || 0) * qty;
      }, 0);
      if (defaultCost > 0) return Number(defaultCost.toFixed(3));
    }

    if (packagingMaterials.length > 0) {
      const defaultCost = packagingMaterials.reduce((sum, m) => sum + Number(m.unit_cost || 0), 0);
      if (defaultCost > 0) return Number(defaultCost.toFixed(3));
    }

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

  // Fallback to brand packaging materials if product has no specific BOM rows
  if (packagingMaterials.length > 0) {
    const defaultCost = packagingMaterials.reduce((sum, m) => sum + Number(m.unit_cost || 0), 0);
    if (defaultCost > 0) return Number(defaultCost.toFixed(3));
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

  // If any item has immutable snapshot, respect the snapshot directly
  const hasSnapshots = items.some(
    (it) => it.packaging_cost_snapshot != null && !isNaN(Number(it.packaging_cost_snapshot)),
  );

  if (hasSnapshots) {
    const total = items.reduce((sum, it) => {
      const qty = Number(it.quantity || it.qty || 1);
      const unitPkgCost = getItemPackagingCost(it, products, variants, bomItems, packagingMaterials);
      return sum + unitPkgCost * qty;
    }, 0);
    return Number(total.toFixed(3));
  }

  // Otherwise calculate with deduction_rule breakdown (per_item * qty + per_order * 1)
  const breakdown = calculateOrderPackagingBreakdown(items, packagingMaterials);
  return breakdown.totalCost;
}

/**
 * Automatically deduct packaging stock when an order is completed.
 */
export async function deductOrderPackagingStock(
  brandId: string,
  productId: string | null | undefined,
  quantitySold: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!brandId || quantitySold <= 0) return { success: true };

    // Check if BOM deduction is enabled for this brand
    const { data: st } = await (supabase as any)
      .from("business_settings")
      .select("bom_enabled")
      .eq("brand_id", brandId)
      .maybeSingle();

    if (st && st.bom_enabled === false) {
      return { success: true };
    }

    // 1. If productId provided, fetch BOM items attached to this product
    if (productId) {
      const { data: bomItems, error } = await (supabase as any)
        .from("product_bom_items")
        .select("packaging_material_id, quantity_per_unit, packaging_materials(id, stock_quantity, deduction_rule)")
        .eq("product_id", productId)
        .eq("brand_id", brandId);

      if (!error && bomItems && bomItems.length > 0) {
        for (const item of bomItems) {
          const mat = item.packaging_materials as any;
          if (!mat) continue;
          const currentQty = Number(mat.stock_quantity || 0);
          const isPerOrder = mat.deduction_rule === "per_order";
          const neededQty = Number(item.quantity_per_unit || 1) * (isPerOrder ? 1 : quantitySold);
          const nextQty = Math.max(0, currentQty - neededQty);

          await (supabase as any)
            .from("packaging_materials")
            .update({ stock_quantity: nextQty } as any)
            .eq("id", mat.id)
            .eq("brand_id", brandId);
        }
        return { success: true };
      }
    }

    // 2. If no productId or no specific BOM, deduct from brand's distinct packaging materials
    const { data: brandBoms } = await (supabase as any)
      .from("product_bom_items")
      .select("packaging_material_id, quantity_per_unit, packaging_materials(id, stock_quantity, deduction_rule)")
      .eq("brand_id", brandId);

    if (brandBoms && brandBoms.length > 0) {
      const seen = new Set<string>();
      for (const item of brandBoms) {
        if (seen.has(item.packaging_material_id)) continue;
        seen.add(item.packaging_material_id);
        const mat = item.packaging_materials as any;
        if (!mat) continue;
        const currentQty = Number(mat.stock_quantity || 0);
        const isPerOrder = mat.deduction_rule === "per_order";
        const neededQty = Number(item.quantity_per_unit || 1) * (isPerOrder ? 1 : quantitySold);
        const nextQty = Math.max(0, currentQty - neededQty);

        await (supabase as any)
          .from("packaging_materials")
          .update({ stock_quantity: nextQty } as any)
          .eq("id", mat.id)
          .eq("brand_id", brandId);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to deduct packaging stock" };
  }
}

/**
 * Calculate total packaging cost breakdown for an entire order considering deduction_rule.
 */
export function calculateOrderPackagingBreakdown(
  orderItems: any[] = [],
  packagingMaterials: any[] = [],
): { perItemCost: number; perOrderCost: number; totalCost: number } {
  const totalQty = orderItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0);

  const perItemMats = packagingMaterials.filter((m) => (m.deduction_rule || "per_item") === "per_item");
  const perOrderMats = packagingMaterials.filter((m) => m.deduction_rule === "per_order");

  const perItemUnitCost = perItemMats.reduce((sum, m) => sum + Number(m.unit_cost || 0), 0);
  const perItemCost = perItemUnitCost * totalQty;

  const perOrderCost = perOrderMats.reduce((sum, m) => sum + Number(m.unit_cost || 0), 0);

  return {
    perItemCost: Number(perItemCost.toFixed(3)),
    perOrderCost: Number(perOrderCost.toFixed(3)),
    totalCost: Number((perItemCost + perOrderCost).toFixed(3)),
  };
}

