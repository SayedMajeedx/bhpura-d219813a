import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { deleteOrdersWithPrivateReceipts } from "@/lib/benefit-receipt.functions";
import { invalidateOrders } from "@/lib/data/orders";
import { arNoun, arNounOblique } from "@/lib/arabic-count";
import { orderKeptMessage } from "@/lib/order-deletion";

/**
 * Confirms and deletes the selected orders of one brand (with their private
 * payment receipts). On success it clears the selection and closes.
 */
export function BulkDeleteOrdersDialog({
  open,
  onOpenChange,
  brandId,
  orderIds,
  keptCount = 0,
  lang,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  orderIds: ReadonlySet<string>;
  /** Selected orders that stay (paid or handed over): not part of what is deleted. */
  keptCount?: number;
  lang: string;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const deleteSelectedOrders = async () => {
    const ids = [...orderIds];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const result = await deleteOrdersWithPrivateReceipts({ data: { brandId, orderIds: ids } });
      toast.success(
        lang === "ar"
          ? `تم حذف ${arNounOblique(result.deleted, "order")} بنجاح`
          : `${result.deleted} orders deleted successfully`,
      );
      onDeleted();
      onOpenChange(false);
      await invalidateOrders(qc, brandId);
    } catch (error) {
      const message = (error as { message?: string } | null)?.message ?? "";
      toast.error(
        message.includes("ORDER_NOT_DELETABLE")
          ? orderKeptMessage(lang === "ar" ? "ar" : "en", 2)
          : message || (lang === "ar" ? "تعذر حذف الطلبات" : "Unable to delete orders"),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {lang === "ar" ? `حذف ${orderIds.size} طلب؟` : `Delete ${orderIds.size} orders?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {lang === "ar"
              ? "سيتم حذف الطلبات المحددة نهائياً واستعادة مخزونها حسب سجلات الحجز. لا يمكن التراجع عن هذا الإجراء."
              : "The selected orders will be permanently deleted and reserved stock will be restored according to the inventory records. This cannot be undone."}
          </AlertDialogDescription>
          {keptCount > 0 && (
            <p className="text-sm font-medium text-foreground">
              {lang === "ar"
                ? `${arNoun(keptCount, "order")} من المحدد لن تُحذف. `
                : `${keptCount} of the selected ${keptCount === 1 ? "order" : "orders"} will stay. `}
              {orderKeptMessage(lang === "ar" ? "ar" : "en", keptCount)}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting || orderIds.size === 0}
            onClick={(event) => {
              event.preventDefault();
              void deleteSelectedOrders();
            }}
          >
            {deleting
              ? lang === "ar"
                ? "جارٍ الحذف..."
                : "Deleting..."
              : lang === "ar"
                ? "تأكيد الحذف"
                : "Confirm delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
