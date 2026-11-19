import { arNounOblique } from "@/lib/arabic-count";
import { AppConfirm } from "@/components/ui/app-confirm";

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
    <AppConfirm
      open={target !== null}
      onOpenChange={onOpenChange}
      title={
        publish
          ? isAr
            ? `نشر ${arNounOblique(count, "product")} في المتجر؟`
            : `Publish ${count} products to the storefront?`
          : isAr
            ? `إخفاء ${arNounOblique(count, "product")} من المتجر؟`
            : `Hide ${count} products from the storefront?`
      }
      description={
        publish
          ? isAr
            ? "ستظهر المنتجات المحددة للزبائن فوراً في المتجر."
            : "The selected products will show to shoppers in the storefront right away."
          : isAr
            ? "ستختفي المنتجات المحددة من المتجر وتبقى عندك في المخزون كمسودات، ويمكنك نشرها لاحقاً."
            : "The selected products disappear from the storefront and stay in your inventory as drafts, to publish later."
      }
      busy={applying}
      cancelLabel={isAr ? "إلغاء" : "Cancel"}
      confirmLabel={
        applying
          ? isAr
            ? "جاري التطبيق..."
            : "Applying..."
          : publish
            ? isAr
              ? "نشر"
              : "Publish"
            : isAr
              ? "إخفاء"
              : "Hide"
      }
      onConfirm={() => {
        onConfirm();
        return false;
      }}
    >
      {publish && withoutPrice > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-foreground">
          {isAr
            ? `تنبيه: ${withoutPrice} منها بدون سعر.`
            : `Note: ${withoutPrice} of them have no price.`}
        </p>
      )}
    </AppConfirm>
  );
}
