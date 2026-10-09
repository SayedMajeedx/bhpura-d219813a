import { useState } from "react";
import { toast } from "sonner";
import { deleteProducts, updateProduct, updateProducts } from "@/lib/data/catalog";
import { deletePublicMediaUrl } from "@/lib/r2-upload";
import type { Product } from "@/features/inventory/types";
import { addPresetToProduct, type PresetLike } from "@/features/inventory/lib/bulk-preset";

/** Products written at once when a preset is added (each product keeps its own fields). */
const PRESET_BATCH = 6;

/**
 * Product selection in the inventory list, plus bulk delete (with media), category change,
 * showing or hiding on the storefront, and adding a customization preset (Fit Passport...),
 * each behind its confirmation dialog.
 */
export function useProductBulkActions({
  brandId,
  products,
  presets,
  isAr,
  onChanged,
}: {
  brandId: string;
  products: Product[];
  presets: PresetLike[];
  isAr: boolean;
  onChanged: () => void;
}) {
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkSelectedCategory, setBulkSelectedCategory] = useState<string>("");
  const [bulkCategoryApplying, setBulkCategoryApplying] = useState(false);

  // true = publish, false = hide, null = dialog closed.
  const [bulkVisibilityTarget, setBulkVisibilityTarget] = useState<boolean | null>(null);
  const [bulkVisibilityApplying, setBulkVisibilityApplying] = useState(false);
  const [bulkPresetOpen, setBulkPresetOpen] = useState(false);
  const [bulkPresetKey, setBulkPresetKey] = useState("");
  const [bulkPresetApplying, setBulkPresetApplying] = useState(false);

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
      await deleteProducts(brandId, ids);
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
      await updateProducts(brandId, ids, { category: catToSave });
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

  const applyBulkVisibility = async () => {
    const ids = [...selectedProductIds];
    if (ids.length === 0 || bulkVisibilityTarget === null) return;
    const isActive = bulkVisibilityTarget;
    setBulkVisibilityApplying(true);
    try {
      await updateProducts(brandId, ids, { is_active: isActive });
      toast.success(
        isAr
          ? isActive
            ? `تم نشر ${ids.length} منتج في المتجر`
            : `تم إخفاء ${ids.length} منتج من المتجر`
          : isActive
            ? `${ids.length} products published to the storefront`
            : `${ids.length} products hidden from the storefront`,
      );
      setBulkVisibilityTarget(null);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isAr
            ? "تعذر تغيير حالة المنتجات"
            : "Could not change the products' visibility",
      );
    } finally {
      setBulkVisibilityApplying(false);
    }
  };

  const applyBulkPreset = async () => {
    const preset = presets.find((candidate) => candidate.key === bulkPresetKey);
    if (!preset || selectedProductIds.size === 0) return;
    const chosen = products.filter((product) => selectedProductIds.has(product.id));
    setBulkPresetApplying(true);
    let added = 0;
    let alreadyHad = 0;
    let failed = 0;
    try {
      for (let start = 0; start < chosen.length; start += PRESET_BATCH) {
        const results = await Promise.allSettled(
          chosen.slice(start, start + PRESET_BATCH).map(async (product) => {
            const patch = addPresetToProduct(product, preset);
            if (!patch) return "had" as const;
            await updateProduct(brandId, product.id, patch);
            return "added" as const;
          }),
        );
        for (const result of results) {
          if (result.status === "rejected") failed++;
          else if (result.value === "had") alreadyHad++;
          else added++;
        }
      }
      const summary = isAr
        ? `أُضيف إلى ${added} منتج` +
          (alreadyHad ? `، و${alreadyHad} كان عنده من قبل` : "") +
          (failed ? `، وتعذر ${failed}` : "")
        : `Added to ${added} products` +
          (alreadyHad ? `, ${alreadyHad} already had it` : "") +
          (failed ? `, ${failed} failed` : "");
      if (failed > 0) toast.error(summary);
      else toast.success(summary);
      if (failed === 0) {
        setBulkPresetOpen(false);
        setBulkPresetKey("");
      }
      onChanged();
    } finally {
      setBulkPresetApplying(false);
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
    bulkVisibilityTarget,
    setBulkVisibilityTarget,
    bulkVisibilityApplying,
    applyBulkVisibility,
    bulkPresetOpen,
    setBulkPresetOpen,
    bulkPresetKey,
    setBulkPresetKey,
    bulkPresetApplying,
    applyBulkPreset,
  };
}
