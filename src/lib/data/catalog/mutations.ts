import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { catalogKeys } from "./keys";

/**
 * Admin catalog writes: products, variants, stock, packaging materials and
 * the packaging BOM. Every write is scoped by `brand_id` on top of RLS, typed
 * against the generated schema, and throws on error. After a product or
 * variant write, call `invalidateCatalog`.
 */

export type NewProduct = TablesInsert<"products">;
export type ProductPatch = TablesUpdate<"products">;
export type NewVariant = TablesInsert<"product_variants">;
export type VariantPatch = TablesUpdate<"product_variants">;
export type NewPackagingMaterial = TablesInsert<"packaging_materials">;
export type PackagingMaterialPatch = TablesUpdate<"packaging_materials">;
export type BomLine = { packaging_material_id: string; quantity_per_unit: number };

/** The product and variant lists of the brand are stale after a write. */
export function invalidateCatalog(qc: QueryClient, brandId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: catalogKeys.products(brandId) }),
    qc.invalidateQueries({ queryKey: catalogKeys.variants(brandId) }),
  ]);
}

// ── Products ────────────────────────────────────────────────────────────────

/** Creates a product of the brand and returns its id. */
export async function createProduct(brandId: string, values: NewProduct): Promise<string> {
  const { data, error } = await supabase
    .from("products")
    .insert({ ...values, brand_id: brandId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Changes columns of one product of the brand. */
export async function updateProduct(brandId: string, productId: string, patch: ProductPatch) {
  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Changes the same columns on several products of the brand. */
export async function updateProducts(brandId: string, productIds: string[], patch: ProductPatch) {
  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("brand_id", brandId)
    .in("id", productIds);
  if (error) throw error;
}

/** Deletes products of the brand (their variants go with them). */
export async function deleteProducts(brandId: string, productIds: string[]) {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("brand_id", brandId)
    .in("id", productIds);
  if (error) throw error;
}

// ── Variants ────────────────────────────────────────────────────────────────

/** Adds one or more variants to the brand's catalog. */
export async function createVariants(brandId: string, rows: NewVariant[]) {
  const { error } = await supabase
    .from("product_variants")
    .insert(rows.map((row) => ({ ...row, brand_id: brandId })));
  if (error) throw error;
}

/** Changes columns of one variant of the brand. */
export async function updateVariant(brandId: string, variantId: string, patch: VariantPatch) {
  const { error } = await supabase
    .from("product_variants")
    .update(patch)
    .eq("id", variantId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Changes the same columns on several variants of the brand. */
export async function updateVariants(brandId: string, variantIds: string[], patch: VariantPatch) {
  const { error } = await supabase
    .from("product_variants")
    .update(patch)
    .eq("brand_id", brandId)
    .in("id", variantIds);
  if (error) throw error;
}

/**
 * After the product editor saves, its variants follow the product: every
 * variant takes the product's cost; variants not on sale take the regular
 * price; variants on sale keep their sale price and take the regular price as
 * the struck-through one. Stops at the first failing step.
 */
export async function syncVariantsWithProduct(
  brandId: string,
  productId: string,
  product: { cost_price: number; base_price: number },
) {
  const forProduct = () => supabase.from("product_variants");
  const cost = await forProduct()
    .update({ cost_price: product.cost_price })
    .eq("product_id", productId)
    .eq("brand_id", brandId);
  if (cost.error) throw cost.error;
  const inherited = await forProduct()
    .update({ selling_price: product.base_price, original_price: null })
    .eq("product_id", productId)
    .eq("brand_id", brandId)
    .is("original_price", null);
  if (inherited.error) throw inherited.error;
  const onSale = await forProduct()
    .update({ original_price: product.base_price })
    .eq("product_id", productId)
    .eq("brand_id", brandId)
    .not("original_price", "is", null);
  if (onSale.error) throw onSale.error;
}

/** Deletes variants of the brand. */
export async function deleteVariants(brandId: string, variantIds: string[]) {
  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("brand_id", brandId)
    .in("id", variantIds);
  if (error) throw error;
}

/**
 * A manual stock change through the stock ledger (the server checks the
 * variant's brand and records the movement). `set` replaces the stock at the
 * location, `delta` adds to it.
 */
export async function adjustVariantStock(args: {
  variantId: string;
  location: "main" | "incubator";
  mode: "set" | "delta";
  value: number;
  note: string;
}) {
  const { error } = await supabase.rpc("rpc_adjust_variant_stock", {
    p_variant_id: args.variantId,
    p_location: args.location,
    p_mode: args.mode,
    p_value: args.value,
    p_reason: "manual_adjustment",
    p_note: args.note,
  });
  if (error) throw error;
}

// ── Packaging materials ─────────────────────────────────────────────────────

export async function createPackagingMaterial(brandId: string, values: NewPackagingMaterial) {
  const { error } = await supabase
    .from("packaging_materials")
    .insert({ ...values, brand_id: brandId });
  if (error) throw error;
}

export async function updatePackagingMaterial(
  brandId: string,
  materialId: string,
  patch: PackagingMaterialPatch,
) {
  const { error } = await supabase
    .from("packaging_materials")
    .update(patch)
    .eq("id", materialId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deletePackagingMaterial(brandId: string, materialId: string) {
  const { error } = await supabase
    .from("packaging_materials")
    .delete()
    .eq("id", materialId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

// ── Packaging BOM ───────────────────────────────────────────────────────────

/**
 * Saves one product's packaging: its direct packaging cost, then its BOM lines
 * (replaced as a whole). Refresh with `catalogKeys.products`, `productBom` and
 * `bomItems`.
 */
export async function saveProductBom(
  brandId: string,
  productId: string,
  directPackagingCost: number,
  lines: BomLine[],
) {
  await updateProduct(brandId, productId, { direct_packaging_cost: directPackagingCost });
  const { error: deleteError } = await supabase
    .from("product_bom_items")
    .delete()
    .eq("product_id", productId)
    .eq("brand_id", brandId);
  if (deleteError) throw deleteError;
  if (lines.length > 0) {
    const { error } = await supabase
      .from("product_bom_items")
      .insert(lines.map((line) => ({ ...line, brand_id: brandId, product_id: productId })));
    if (error) throw error;
  }
}

/**
 * Gives every product of the brand the same direct packaging cost and BOM
 * lines. Returns how many products there are (nothing is written when there
 * are none). The cost update and the removal of the old lines ignore their
 * errors, as they always have (bug backlog #16).
 */
export async function applyBomToAllProducts(
  brandId: string,
  directPackagingCost: number,
  lines: BomLine[],
): Promise<number> {
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .eq("brand_id", brandId);
  if (productsError) throw productsError;
  const productIds = (products ?? []).map((p) => p.id);
  if (productIds.length === 0) return 0;

  await supabase
    .from("products")
    .update({ direct_packaging_cost: directPackagingCost })
    .eq("brand_id", brandId);
  await supabase.from("product_bom_items").delete().eq("brand_id", brandId);

  if (lines.length > 0) {
    const { error } = await supabase.from("product_bom_items").insert(
      productIds.flatMap((productId) =>
        lines.map((line) => ({
          brand_id: brandId,
          product_id: productId,
          packaging_material_id: line.packaging_material_id,
          quantity_per_unit: line.quantity_per_unit,
        })),
      ),
    );
    if (error) throw error;
  }
  return productIds.length;
}
