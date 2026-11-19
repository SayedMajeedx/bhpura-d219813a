import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { InventoryCategory } from "@/features/inventory/lib/product-list";
import { assignableCategories } from "@/lib/smart-categories";
import { arNounOblique, countOf } from "@/lib/arabic-count";
import { removeProductsWarning } from "@/features/inventory/lib/product-delete";
import { AppConfirm } from "@/components/ui/app-confirm";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";

/** Confirms deleting the selected products with their variants and stock. */
export function BulkDeleteProductsDialog({
  open,
  onOpenChange,
  count,
  deleting,
  onConfirm,
  isAr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  deleting: boolean;
  onConfirm: () => void;
  isAr: boolean;
}) {
  return (
    <AppConfirm
      open={open}
      onOpenChange={onOpenChange}
      title={
        isAr
          ? `حذف ${arNounOblique(count, "product")}؟`
          : `Delete ${countOf(count, "product", "en")}?`
      }
      description={removeProductsWarning(count, isAr)}
      destructive
      busy={deleting}
      cancelLabel={isAr ? "إلغاء" : "Cancel"}
      confirmLabel={
        deleting
          ? isAr
            ? "جاري الحذف..."
            : "Deleting..."
          : isAr
            ? "تأكيد الحذف"
            : "Confirm Delete"
      }
      onConfirm={() => {
        onConfirm();
        return false;
      }}
    />
  );
}

/** Moves the selected products to one category, or clears their category. */
export function BulkCategoryDialog({
  open,
  onOpenChange,
  count,
  categories,
  value,
  onValueChange,
  applying,
  onApply,
  isAr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  categories: InventoryCategory[];
  value: string;
  onValueChange: (value: string) => void;
  applying: boolean;
  onApply: () => void;
  isAr: boolean;
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} kind="form">
      <AppDialogHeader
        title={isAr ? "تغيير قسم المنتجات المحددة" : "Change Category for Selected Products"}
      />

      <AppDialogBody>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `اختر القسم الجديد لـ ${arNounOblique(count, "product")} تم تحديدها، أو اختر "بدون قسم" لإزالتها من أي قسم:`
              : `Select the new category for ${count} selected products, or choose "No category" to unassign:`}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "القسم المستهدف" : "Target Category"}
            </Label>
            <select
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
            >
              <option value="">
                {isAr ? "بدون قسم (إلغاء تعيين القسم)" : "No category (Unassign)"}
              </option>
              {assignableCategories(categories).map((c) => {
                const val = c.slug || c.name_en || "";
                const label = isAr ? c.name_ar || c.name_en : c.name_en;
                return (
                  <option key={c.id} value={val}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </AppDialogBody>
      <AppDialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={applying}
          onClick={() => onOpenChange(false)}
        >
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        <Button
          type="button"
          disabled={applying}
          onClick={onApply}
          className="bg-primary text-primary-foreground"
        >
          {applying
            ? isAr
              ? "جاري التحديث..."
              : "Updating..."
            : isAr
              ? "تطبيق التغيير"
              : "Apply Changes"}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
