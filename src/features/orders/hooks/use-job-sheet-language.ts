import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfileOptional } from "@/lib/profile-context";
import { accountingQueries } from "@/lib/data/accounting";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { sheetLanguageFor, type SheetLang } from "@/features/orders/lib/job-sheet";

/**
 * The language an order's job sheet opens on: the language of the supplier holding its pieces,
 * when that supplier chose one, else the screen's. Suppliers are read only by staff who may see
 * the store's finances (the tables say so); anyone else starts on the screen's language and can
 * still choose.
 */
export function useJobSheetLanguage(
  brandId: string,
  orderItemIds: readonly string[],
  screenLang: "ar" | "en",
): SheetLang {
  const profile = useProfileOptional();
  const canViewFinancials = Boolean(profile?.canViewFinancials);
  const ids = useMemo(() => orderItemIds.filter(Boolean), [orderItemIds]);
  // The same reads the order's supplier pieces and the supplier picker make: shared caches.
  const piecesQ = useQuery({
    ...supplierOrderQueries.orderPieces(brandId, ids),
    enabled: canViewFinancials && ids.length > 0,
  });
  const vendorsQ = useQuery({
    ...accountingQueries.vendorOptions(brandId),
    enabled: canViewFinancials && Boolean(brandId) && (piecesQ.data?.length ?? 0) > 0,
  });
  const vendorId = piecesQ.data?.[0]?.vendor_id ?? null;
  const vendorLang = vendorId
    ? (vendorsQ.data ?? []).find((v) => v.id === vendorId)?.preferred_language
    : null;
  return sheetLanguageFor({ vendorLang, screenLang });
}
