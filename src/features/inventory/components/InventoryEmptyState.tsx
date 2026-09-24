import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OsEmptyState } from "@/components/os/os-empty-state";

/** Shown when no product matches: add the first product, or clear the filters. */
export function InventoryEmptyState({
  productCount,
  isAr,
  onAddProduct,
  onClearFilters,
}: {
  productCount: number;
  isAr: boolean;
  onAddProduct: () => void;
  onClearFilters: () => void;
}) {
  return (
    <OsEmptyState
      icon={Package}
      compact
      title={isAr ? "لا توجد منتجات مطابقة" : "No matching products"}
      description={
        productCount === 0
          ? isAr
            ? "ابدأ بإضافة أول منتج إلى مخزون المتجر."
            : "Add the first product to your store inventory."
          : isAr
            ? "غيّر البحث أو الفلاتر لعرض منتجات أخرى."
            : "Change the search or filters to see other products."
      }
      action={
        <Button type="button" onClick={productCount === 0 ? onAddProduct : onClearFilters}>
          {productCount === 0
            ? isAr
              ? "إضافة منتج"
              : "Add Product"
            : isAr
              ? "مسح الفلاتر"
              : "Clear Filters"}
        </Button>
      }
    />
  );
}
