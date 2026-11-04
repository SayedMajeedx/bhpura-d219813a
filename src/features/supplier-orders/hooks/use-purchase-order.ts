import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useOrderNumberFormat } from "@/hooks/use-order-number";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import type { JobSheetLine, JobSheetProduct, Lang } from "@/features/orders/lib/job-sheet";
import { pieceSpecs, purchaseOrderHtml, type PieceSpec } from "../lib/purchase-order-sheet";
import type { SupplierOrder, SupplierOrderLine } from "../lib/order-state";
import type { SupplierCatalog } from "./use-supplier-catalog";

type Details = ReadonlyArray<JobSheetLine & { id: string }>;

/**
 * Each customer's piece on a supplier order with its specification from the customer's order
 * line (size or made to measure, options, measurements, notes, extras), read in `lang`.
 */
export function usePieceSpecs(
  brandId: string,
  lines: readonly SupplierOrderLine[],
  products: readonly unknown[],
  lang: Lang,
): ReadonlyMap<string, PieceSpec> {
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const ids = useMemo(() => lines.map((l) => l.order_item_id).filter(Boolean) as string[], [lines]);
  const detailsQ = useQuery(supplierOrderQueries.pieceDetails(brandId, ids));
  return useMemo(
    () =>
      pieceSpecs((detailsQ.data ?? []) as unknown as Details, products as JobSheetProduct[], {
        lang,
        brandAddons: storeProfile.addons,
        storeVertical: storeProfile.vertical,
      }),
    [detailsQ.data, products, lang, storeProfile.addons, storeProfile.vertical],
  );
}

/**
 * Prints a supplier order as a document, in the language chosen, with or without its prices.
 * The window opens at the press, before anything is read, so a browser does not block it.
 */
export function usePrintPurchaseOrder({
  brandId,
  catalog,
  brandName,
  currency,
  lang,
}: {
  brandId: string;
  catalog: SupplierCatalog;
  brandName: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const qc = useQueryClient();
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const numberFormat = useOrderNumberFormat();
  const isAr = lang === "ar";

  return async (order: SupplierOrder, sheetLang: Lang, withPrices: boolean) => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error(isAr ? "المتصفح منع فتح نافذة الطباعة" : "The browser blocked the print window");
      return;
    }
    try {
      const ids = order.items.map((l) => l.order_item_id).filter(Boolean) as string[];
      const details = await qc.fetchQuery(supplierOrderQueries.pieceDetails(brandId, ids));
      const specs = pieceSpecs(
        details as unknown as Details,
        catalog.products as unknown as JobSheetProduct[],
        { lang: sheetLang, brandAddons: storeProfile.addons, storeVertical: storeProfile.vertical },
      );
      w.document.open();
      w.document.write(
        purchaseOrderHtml({
          brand: brandName,
          order,
          specs,
          sizeName: (id) => catalog.sizeName(id),
          lang: sheetLang,
          withPrices,
          currency,
          numberFormat,
        }),
      );
      w.document.close();
    } catch {
      w.close();
      toast.error(
        isAr ? "تعذرت قراءة القطع، حاول مرة أخرى." : "Could not read the pieces. Try again.",
      );
    }
  };
}
