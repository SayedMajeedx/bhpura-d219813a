import { AppConfirm } from "@/components/ui/app-confirm";
import { useT } from "@/lib/i18n";
import { removeProductsWarning } from "@/features/inventory/lib/product-delete";

/** Confirms removing one product: deleted, or archived when it has a history. */
export function DeleteProductDialog({
  productToDelete,
  setProductToDelete,
  onDelete,
  isAr,
}: {
  productToDelete: string | null;
  setProductToDelete: (id: string | null) => void;
  onDelete: (id: string) => Promise<void>;
  isAr: boolean;
}) {
  const t = useT();
  return (
    <AppConfirm
      open={!!productToDelete}
      onOpenChange={(open) => !open && setProductToDelete(null)}
      title={t("common.delete")}
      description={removeProductsWarning(1, isAr)}
      destructive
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      onConfirm={() => {
        if (productToDelete) void onDelete(productToDelete);
      }}
    />
  );
}
