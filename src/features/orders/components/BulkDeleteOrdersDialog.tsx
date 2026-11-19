import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteOrdersWithPrivateReceipts } from "@/lib/benefit-receipt.functions";
import { invalidateOrders } from "@/lib/data/orders";
import { arNoun, arNounOblique, countOf } from "@/lib/arabic-count";
import { orderKeptMessage } from "@/lib/order-deletion";
import { AppConfirm } from "@/components/ui/app-confirm";

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
    <AppConfirm
      open={open}
      onOpenChange={onOpenChange}
      title={
        lang === "ar"
          ? `حذف ${arNounOblique(orderIds.size, "order")}؟`
          : `Delete ${countOf(orderIds.size, "order", "en")}?`
      }
      description={
        lang === "ar"
          ? "سيتم حذف الطلبات المحددة نهائياً واستعادة مخزونها حسب سجلات الحجز. لا يمكن التراجع عن هذا الإجراء."
          : "The selected orders will be permanently deleted and reserved stock will be restored according to the inventory records. This cannot be undone."
      }
      destructive
      busy={deleting}
      confirmDisabled={orderIds.size === 0}
      cancelLabel={lang === "ar" ? "إلغاء" : "Cancel"}
      confirmLabel={
        deleting
          ? lang === "ar"
            ? "جارٍ الحذف..."
            : "Deleting..."
          : lang === "ar"
            ? "تأكيد الحذف"
            : "Confirm delete"
      }
      onConfirm={async () => {
        await deleteSelectedOrders();
        return false;
      }}
    >
      {keptCount > 0 && (
        <p className="text-sm font-medium text-foreground">
          {lang === "ar"
            ? `${arNoun(keptCount, "order")} من المحدد لن تُحذف. `
            : `${keptCount} of the selected ${keptCount === 1 ? "order" : "orders"} will stay. `}
          {orderKeptMessage(lang === "ar" ? "ar" : "en", keptCount)}
        </p>
      )}
    </AppConfirm>
  );
}
