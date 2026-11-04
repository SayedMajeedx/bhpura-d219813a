import { toast } from "sonner";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useOrderNumberFormat } from "@/hooks/use-order-number";
import { logActivity } from "@/lib/activity-log";
import {
  jobSheetHtml,
  sheetPieces,
  type JobSheetLine,
  type JobSheetProduct,
  type SheetLang,
  type SheetWhere,
} from "../lib/job-sheet";
import type { AlterationChange, AlterationKind } from "../lib/alterations";

export type AlterationSheet = {
  sourceItemId: string;
  kind: AlterationKind;
  changes: readonly AlterationChange[];
  note: string | null;
  where: SheetWhere | null;
};

/**
 * Prints an alteration's sheet (PR 1's job sheet with an "Alteration" or "Fix" heading and what
 * to do first): the piece as it was made, from the order's own line, in the language chosen.
 * Printing is kept in the order's activity.
 */
export function useAlterationSheet({
  brandId,
  order,
  lines,
  products,
  storeName,
  customerName,
}: {
  brandId: string;
  order: { id: string; invoice_number?: number | null; order_date?: string | null };
  lines: readonly (JobSheetLine & { id?: string | null })[];
  products: readonly JobSheetProduct[];
  storeName: string;
  customerName: string | null;
}) {
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const { vocabulary } = useVocabulary();
  const numberFormat = useOrderNumberFormat(brandId);

  return (sheet: AlterationSheet, sheetLang: SheetLang, lang: "ar" | "en") => {
    const line = lines.find((l) => l.id === sheet.sourceItemId);
    if (!line) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error(
        lang === "ar" ? "المتصفح منع فتح نافذة الطباعة" : "The browser blocked the print window",
      );
      return;
    }
    const read = sheetPieces([line], products, {
      lang: sheetLang,
      brandAddons: storeProfile.addons,
      storeVertical: storeProfile.vertical,
      every: true,
    });
    const workshopIn = (l: "ar" | "en") =>
      vocabulary.workshop?.[l] || (l === "ar" ? "الورشة" : "Workshop");
    const common = {
      brand: storeName || (sheetLang === "en" ? "Store" : "المتجر"),
      orderNumber: order.invoice_number ?? order.id.slice(0, 8),
      numberFormat,
      orderDate: order.order_date ?? null,
      customerName,
      where: sheet.where,
      alteration: { kind: sheet.kind, changes: sheet.changes, note: sheet.note },
    };
    w.document.open();
    w.document.write(
      read.lang === "both"
        ? jobSheetHtml({
            ...common,
            lang: "both",
            workshop: { ar: workshopIn("ar"), en: workshopIn("en") },
            pieces: read.pieces,
          })
        : jobSheetHtml({
            ...common,
            lang: read.lang,
            workshop: workshopIn(read.lang),
            pieces: read.pieces,
          }),
    );
    w.document.close();
    void logActivity({
      action: "job_sheet_printed",
      order_id: order.id,
      en: `Printed the ${sheet.kind === "fix" ? "fix" : "alteration"} sheet`,
      ar: `طبع أمر ال${sheet.kind === "fix" ? "تصليح" : "تعديل"}`,
    });
  };
}
