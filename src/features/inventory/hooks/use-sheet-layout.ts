import { useCallback, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import type { InventoryLayout } from "@/features/inventory/lib/list-view";

/**
 * The inventory's layout with the sheet in it: the sheet replaces the rows, the photos and the
 * paging, and leaving it with changes not yet saved asks first (they would be lost).
 */
export function useSheetLayout({
  layout,
  setLayout,
  isAr,
}: {
  layout: InventoryLayout;
  setLayout: (layout: InventoryLayout) => void;
  isAr: boolean;
}) {
  const [sheetDirty, setSheetDirty] = useState(false);
  const sheet = layout === "sheet";
  const changeLayout = useCallback(
    async (next: InventoryLayout) => {
      if (sheet && sheetDirty && next !== "sheet") {
        const leave = await confirmDialog({
          title: isAr ? "ترك الجدول دون حفظ؟" : "Leave the sheet without saving?",
          description: isAr
            ? "التغييرات التي لم تُحفظ ستضيع."
            : "The changes you have not saved will be lost.",
          destructive: true,
        });
        if (!leave) return;
        setSheetDirty(false);
      }
      setLayout(next);
    },
    [sheet, sheetDirty, isAr, setLayout],
  );
  return { sheet, changeLayout, setSheetDirty };
}

/**
 * The notice after a product is created: a service is ready as saved; a product offers to open
 * its sizes and colours (`openSizes` expands its row and brings it into view).
 */
export function productCreatedNotice(
  kind: "service" | "product",
  isAr: boolean,
  openSizes: () => void,
) {
  if (kind === "service") {
    toast.success(isAr ? "تم إنشاء الخدمة." : "Service created.");
    return;
  }
  toast.success(
    isAr
      ? "تم إنشاء المنتج بنجاح! تم فتح قسم المقاسات والألوان لإضافة خياراتك."
      : "Product created successfully! Variants panel opened to add sizes & colors.",
    {
      action: { label: isAr ? "إضافة مقاسات وألوان" : "Add sizes & colors", onClick: openSizes },
      duration: 8000,
    },
  );
}
