import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deletePublicMediaUrl } from "@/lib/r2-upload";
import type { Product } from "@/features/inventory/types";

/**
 * Product selection in the inventory list, plus bulk delete (with media) and
 * bulk category change, each behind its confirmation dialog.
 */
export function useProductBulkActions({
  brandId,
  products,
  isAr,
  onChanged,
}: {
  brandId: string;
  products: Product[];
  isAr: boolean;
  onChanged: () => void;
}) {
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkSelectedCategory, setBulkSelectedCategory] = useState<string>("");
  const [bulkCategoryApplying, setBulkCategoryApplying] = useState(false);

  const toggleSelectedProduct = (productId: string) =>
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

  const deleteSelectedProducts = async () => {
    const ids = [...selectedProductIds];
    if (ids.length === 0) return;
    const selectedProducts = products.filter((product) => selectedProductIds.has(product.id));
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("brand_id", brandId)
        .in("id", ids);
      if (error) throw error;
      const mediaUrls = new Set(
        selectedProducts
          .flatMap((product) => [
            product.image_url,
            ...(product.media ?? []).map((item) => item.url),
          ])
          .filter((url): url is string => Boolean(url)),
      );
      for (const url of mediaUrls) void deletePublicMediaUrl(brandId, url).catch(() => undefined);
      toast.success(isAr ? `تم حذف ${ids.length} منتج` : `${ids.length} products deleted`);
      setSelectedProductIds(new Set());
      setBulkDeleteOpen(false);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isAr
            ? "تعذر حذف المنتجات"
            : "Could not delete products",
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const applyBulkCategory = async () => {
    const ids = [...selectedProductIds];
    if (ids.length === 0) return;
    setBulkCategoryApplying(true);
    try {
      const catToSave =
        bulkSelectedCategory && bulkSelectedCategory.trim() !== ""
          ? bulkSelectedCategory.trim()
          : null;
      const { error } = await (supabase.from("products") as any)
        .update({ category: catToSave })
        .eq("brand_id", brandId)
        .in("id", ids);
      if (error) throw error;
      toast.success(
        isAr
          ? catToSave
            ? `تم تحديث قسم ${ids.length} منتج بنجاح`
            : `تم تعيين ${ids.length} منتج كـ "بدون قسم" بنجاح`
          : `Updated category for ${ids.length} products`,
      );
      setSelectedProductIds(new Set());
      setBulkCategoryOpen(false);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isAr
            ? "تعذر تحديث قسم المنتجات"
            : "Could not update products category",
      );
    } finally {
      setBulkCategoryApplying(false);
    }
  };

  return {
    selectedProductIds,
    setSelectedProductIds,
    toggleSelectedProduct,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkDeleting,
    deleteSelectedProducts,
    bulkCategoryOpen,
    setBulkCategoryOpen,
    bulkSelectedCategory,
    setBulkSelectedCategory,
    bulkCategoryApplying,
    applyBulkCategory,
  };
}
