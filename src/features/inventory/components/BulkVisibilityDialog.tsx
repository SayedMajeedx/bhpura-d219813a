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

/** Confirms publishing the selected products to the storefront, or hiding them from it. */
export function BulkVisibilityDialog({
  target,
  onOpenChange,
  count,
  withoutPrice,
  applying,
  onConfirm,
  isAr,
}: {
  /** true = publish, false = hide, null = closed. */
  target: boolean | null;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** How many of them have no price yet (only matters when publishing). */
  withoutPrice: number;
  applying: boolean;
  onConfirm: () => void;
  isAr: boolean;
}) {
  const publish = target === true;
  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {publish
              ? isAr
                ? `نشر ${count} منتج في المتجر؟`
                : `Publish ${count} products to the storefront?`
              : isAr
                ? `إخفاء ${count} منتج من المتجر؟`
                : `Hide ${count} products from the storefront?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {publish
              ? isAr
                ? "ستظهر المنتجات المحددة للزبائن فوراً في المتجر."
                : "The selected products will show to shoppers in the storefront right away."
              : isAr
                ? "ستختفي المنتجات المحددة من المتجر وتبقى عندك في المخزون كمسودات، ويمكنك نشرها لاحقاً."
                : "The selected products disappear from the storefront and stay in your inventory as drafts, to publish later."}
          </AlertDialogDescription>
          {publish && withoutPrice > 0 && (
            <p className="text-xs font-semibold text-amber-600">
              {isAr
                ? `تنبيه: ${withoutPrice} منها بدون سعر.`
                : `Note: ${withoutPrice} of them have no price.`}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={applying}>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            disabled={applying}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {applying
              ? isAr
                ? "جاري التطبيق..."
                : "Applying..."
              : publish
                ? isAr
                  ? "نشر"
                  : "Publish"
                : isAr
                  ? "إخفاء"
                  : "Hide"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
