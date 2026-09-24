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

/** Asks before adding a variant with no stock to the order. */
export function OutOfStockConfirmDialog({
  variant,
  onClose,
  onConfirm,
  lang,
}: {
  variant: any | null;
  onClose: () => void;
  onConfirm: (variant: any) => void;
  lang: string;
}) {
  return (
    <AlertDialog
      open={Boolean(variant)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {lang === "ar" ? "تنبيه: الصنف نافد من المخزون" : "Notice: Item is Out of Stock"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {lang === "ar"
              ? "هذا الصنف رصيده الحالي 0 في المخزون. هل ترغب في إضافته إلى الطلب على أي حال؟"
              : "This item currently has 0 units in stock. Do you want to add it to the order anyway?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (variant) {
                onConfirm(variant);
                onClose();
              }
            }}
          >
            {lang === "ar" ? "إضافة على أي حال" : "Add Anyway"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
