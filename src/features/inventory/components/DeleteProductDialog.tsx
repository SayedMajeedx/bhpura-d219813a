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
    <AlertDialog
      open={!!productToDelete}
      onOpenChange={(open) => !open && setProductToDelete(null)}
    >
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
          <AlertDialogDescription>{removeProductsWarning(1, isAr)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setProductToDelete(null)}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (productToDelete) {
                void onDelete(productToDelete);
                setProductToDelete(null);
              }
            }}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
