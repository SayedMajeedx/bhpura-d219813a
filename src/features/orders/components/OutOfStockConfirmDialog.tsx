import { AppConfirm } from "@/components/ui/app-confirm";

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
  const ar = lang === "ar";
  return (
    <AppConfirm
      open={Boolean(variant)}
      onOpenChange={(open) => !open && onClose()}
      title={ar ? "تنبيه: الصنف نافد من المخزون" : "Notice: Item is Out of Stock"}
      description={
        ar
          ? "هذا الصنف رصيده الحالي 0 في المخزون. هل ترغب في إضافته إلى الطلب على أي حال؟"
          : "This item currently has 0 units in stock. Do you want to add it to the order anyway?"
      }
      destructive
      confirmLabel={ar ? "إضافة على أي حال" : "Add Anyway"}
      cancelLabel={ar ? "إلغاء" : "Cancel"}
      onConfirm={() => {
        if (variant) onConfirm(variant);
      }}
    />
  );
}
