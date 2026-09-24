import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InventoryCategory } from "@/features/inventory/lib/product-list";

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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAr ? `حذف ${count} منتج؟` : `Delete ${count} products?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isAr
              ? "سيتم حذف المنتجات المحددة ومتغيراتها ومخزونها نهائياً. لا يمكن التراجع عن هذا الإجراء."
              : "The selected products, their variants, and inventory will be permanently deleted. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {deleting
              ? isAr
                ? "جاري الحذف..."
                : "Deleting..."
              : isAr
                ? "تأكيد الحذف"
                : "Confirm Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {isAr ? "تغيير قسم المنتجات المحددة" : "Change Category for Selected Products"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `اختر القسم الجديد لـ ${count} منتج تم تحديدها، أو اختر "بدون قسم" لإزالتها من أي قسم:`
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
              {categories.map((c) => {
                const val = c.slug || c.name_en;
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
        <DialogFooter className="gap-2 sm:gap-0">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
