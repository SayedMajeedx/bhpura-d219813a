import type { useProductBulkActions } from "@/features/inventory/hooks/use-product-bulk-actions";
import {
  BulkCategoryDialog,
  BulkDeleteProductsDialog,
} from "@/features/inventory/components/ProductBulkDialogs";
import { BulkPresetDialog } from "@/features/inventory/components/BulkPresetDialog";
import { BulkVisibilityDialog } from "@/features/inventory/components/BulkVisibilityDialog";
import type { InventoryCategory } from "@/features/inventory/lib/product-list";
import type { PresetLike } from "@/features/inventory/lib/bulk-preset";
import type { Product } from "@/features/inventory/types";

/** The confirmation dialogs of the inventory list's bulk actions, driven by `useProductBulkActions`. */
export function ProductBulkDialogsHost({
  bulk,
  products,
  categories,
  presets,
  isAr,
}: {
  bulk: ReturnType<typeof useProductBulkActions>;
  products: Product[];
  categories: InventoryCategory[];
  presets: (PresetLike & { label: { ar: string; en: string } })[];
  isAr: boolean;
}) {
  const count = bulk.selectedProductIds.size;
  const withoutPrice = products.filter(
    (product) => bulk.selectedProductIds.has(product.id) && !(Number(product.base_price) > 0),
  ).length;
  return (
    <>
      <BulkDeleteProductsDialog
        open={bulk.bulkDeleteOpen}
        onOpenChange={bulk.setBulkDeleteOpen}
        count={count}
        deleting={bulk.bulkDeleting}
        onConfirm={() => void bulk.deleteSelectedProducts()}
        isAr={isAr}
      />
      <BulkCategoryDialog
        open={bulk.bulkCategoryOpen}
        onOpenChange={bulk.setBulkCategoryOpen}
        count={count}
        categories={categories}
        value={bulk.bulkSelectedCategory}
        onValueChange={bulk.setBulkSelectedCategory}
        applying={bulk.bulkCategoryApplying}
        onApply={() => void bulk.applyBulkCategory()}
        isAr={isAr}
      />
      <BulkVisibilityDialog
        target={bulk.bulkVisibilityTarget}
        onOpenChange={(next) => !next && bulk.setBulkVisibilityTarget(null)}
        count={count}
        withoutPrice={withoutPrice}
        applying={bulk.bulkVisibilityApplying}
        onConfirm={() => void bulk.applyBulkVisibility()}
        isAr={isAr}
      />
      <BulkPresetDialog
        open={bulk.bulkPresetOpen}
        onOpenChange={bulk.setBulkPresetOpen}
        count={count}
        presets={presets}
        value={bulk.bulkPresetKey}
        onValueChange={bulk.setBulkPresetKey}
        applying={bulk.bulkPresetApplying}
        onApply={() => void bulk.applyBulkPreset()}
        isAr={isAr}
      />
    </>
  );
}
