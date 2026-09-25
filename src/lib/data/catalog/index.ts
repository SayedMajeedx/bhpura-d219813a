import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/**
 * The admin catalog: a brand's products, variants, packaging BOM and
 * packaging materials, as the inventory, order, expenses and dashboard screens
 * read them. One key, one fetcher and one order per list: before this, the
 * same keys were filled by screens that sorted differently (or not at all),
 * so whichever screen loaded first decided the order the others showed.
 * A screen that needs another order sorts its own copy.
 */

/** A product media item (image or streamed video). */
export type ProductMediaItem = {
  type: "image" | "video";
  url: string;
  stream_uid?: string;
  stream_iframe_url?: string;
  poster_url?: string;
};

/** A customer-filled field on a product (engraving, measurements...). */
export type ProductCustomField = {
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "file";
  options?: string[];
  required?: boolean;
};

/** A product row with its JSON lists parsed (never null). */
export type AdminProduct = Omit<Tables<"products">, "media" | "custom_fields"> & {
  media: ProductMediaItem[];
  custom_fields: ProductCustomField[];
};
export type AdminVariant = Tables<"product_variants">;
export type PackagingMaterial = Tables<"packaging_materials">;

export const catalogKeys = {
  products: (brandId: string) => ["products", brandId] as const,
  variants: (brandId: string) => ["variants", brandId] as const,
  bomItems: (brandId: string) => ["product-bom-items-all", brandId] as const,
  /** Every product's own BOM of the brand (prefix of `productBom`). */
  productBoms: (brandId: string) => ["product-bom-items", brandId] as const,
  productBom: (brandId: string, productId: string) =>
    [...catalogKeys.productBoms(brandId), productId] as const,
  packagingMaterials: (brandId: string) => ["packaging-materials", brandId] as const,
};

/** The brand's products, newest first. */
export async function fetchAdminProducts(brandId: string): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...p,
    media: (Array.isArray(p.media) ? p.media : []) as unknown as ProductMediaItem[],
    custom_fields: (Array.isArray(p.custom_fields)
      ? p.custom_fields
      : []) as unknown as ProductCustomField[],
  }));
}

/** The brand's variants, oldest first (the order they were added in). */
export async function fetchAdminVariants(brandId: string): Promise<AdminVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/**
 * Every packaging line of every product. A failure reads as "no BOM"
 * (packaging costs then count as zero) rather than breaking the screen.
 */
export async function fetchBomItems(brandId: string) {
  const { data, error } = await supabase
    .from("product_bom_items")
    .select("product_id, packaging_material_id, quantity_per_unit")
    .eq("brand_id", brandId);
  if (error) return [];
  return data ?? [];
}
export type BomItem = Awaited<ReturnType<typeof fetchBomItems>>[number];

/** One product's packaging lines. */
export async function fetchProductBom(brandId: string, productId: string) {
  const { data, error } = await supabase
    .from("product_bom_items")
    .select("packaging_material_id, quantity_per_unit")
    .eq("product_id", productId)
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}

/** The brand's packaging materials, newest first. */
export async function fetchPackagingMaterials(brandId: string): Promise<PackagingMaterial[]> {
  const { data, error } = await supabase
    .from("packaging_materials")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Admin screens edit the catalog while others read it; 30s keeps lists fresh without refetch storms. */
const CATALOG_CACHE = { staleTime: 30_000 } as const;

export const catalogQueries = {
  products: (brandId: string) =>
    queryOptions({
      queryKey: catalogKeys.products(brandId),
      queryFn: () => fetchAdminProducts(brandId),
      enabled: Boolean(brandId),
      ...CATALOG_CACHE,
    }),
  variants: (brandId: string) =>
    queryOptions({
      queryKey: catalogKeys.variants(brandId),
      queryFn: () => fetchAdminVariants(brandId),
      enabled: Boolean(brandId),
      ...CATALOG_CACHE,
    }),
  bomItems: (brandId: string) =>
    queryOptions({
      queryKey: catalogKeys.bomItems(brandId),
      queryFn: () => fetchBomItems(brandId),
      enabled: Boolean(brandId),
      ...CATALOG_CACHE,
    }),
  productBom: (brandId: string, productId: string) =>
    queryOptions({
      queryKey: catalogKeys.productBom(brandId, productId),
      queryFn: () => fetchProductBom(brandId, productId),
      enabled: Boolean(brandId && productId),
    }),
  packagingMaterials: (brandId: string) =>
    queryOptions({
      queryKey: catalogKeys.packagingMaterials(brandId),
      queryFn: () => fetchPackagingMaterials(brandId),
      enabled: Boolean(brandId),
      ...CATALOG_CACHE,
    }),
};
