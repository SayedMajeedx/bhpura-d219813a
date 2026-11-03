import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useOrderNumberFormat } from "@/hooks/use-order-number";
import { logActivity } from "@/lib/activity-log";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import {
  jobSheetsHtml,
  type JobSheetProduct,
  type SheetLang,
} from "@/features/orders/lib/job-sheet";
import { supplierOrderSheets } from "../lib/supplier-sheets";
import type { SupplierOrder } from "../lib/order-state";
import type { SupplierCatalog } from "./use-supplier-catalog";

type PrintedOrder = Pick<
  SupplierOrder,
  "id" | "vendor_name" | "po_number" | "expected_at" | "items"
>;

/**
 * Prints every customer's piece on a supplier's order (or a batch just sent) as job sheets, one
 * page each, in one window. The window opens at the press, before anything is read, so a browser
 * does not block it; the sheets are written into it once their lines are read.
 */
export function usePrintSupplierSheets({
  brandId,
  catalog,
  brandName,
  lang,
}: {
  brandId: string;
  catalog: SupplierCatalog;
  brandName: string;
  lang: "ar" | "en";
}) {
  const qc = useQueryClient();
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const { vocabulary } = useVocabulary();
  const numberFormat = useOrderNumberFormat();
  const isAr = lang === "ar";

  return async (
    /** The supplier order, or how to read it (it is read once the window is open). */
    source: PrintedOrder | (() => Promise<PrintedOrder>),
    sheetLang: SheetLang,
    onlyOrderItemIds?: readonly string[],
  ) => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error(isAr ? "المتصفح منع فتح نافذة الطباعة" : "The browser blocked the print window");
      return;
    }
    try {
      const order = typeof source === "function" ? await source() : source;
      const ids = order.items.map((l) => l.order_item_id).filter(Boolean) as string[];
      const details = await qc.fetchQuery(supplierOrderQueries.pieceDetails(brandId, ids));
      const workshopIn = (l: "ar" | "en") =>
        vocabulary.workshop?.[l] || (l === "ar" ? "الورشة" : "Workshop");
      const sheets = supplierOrderSheets({
        order,
        details: details as Parameters<typeof supplierOrderSheets>[0]["details"],
        products: catalog.products as unknown as JobSheetProduct[],
        sheetLang,
        brand: brandName,
        workshop: { ar: workshopIn("ar"), en: workshopIn("en") },
        numberFormat,
        onlyOrderItemIds,
        brandAddons: storeProfile.addons,
        storeVertical: storeProfile.vertical,
      });
      if (sheets.length === 0) {
        w.close();
        toast.error(isAr ? "لا قطع زبائن في هذه الطلبية" : "There are no customer pieces on it");
        return;
      }
      w.document.open();
      w.document.write(jobSheetsHtml(sheets));
      w.document.close();
      const orderIds = [
        ...new Set(order.items.map((l) => l.customer_order?.id).filter(Boolean) as string[]),
      ];
      for (const order_id of orderIds) {
        void logActivity({
          action: "job_sheet_printed",
          order_id,
          en: `Printed the job sheet from supplier order ${order.po_number}`,
          ar: `طبع أمر التشغيل من طلبية المورد ${order.po_number}`,
        });
      }
    } catch {
      w.close();
      toast.error(
        isAr ? "تعذرت قراءة القطع، حاول مرة أخرى." : "Could not read the pieces. Try again.",
      );
    }
  };
}
