import { useQuery } from "@tanstack/react-query";
import { workshopQueries } from "@/lib/data/supplier-orders/workshop";
import { sheetLanguageFor, type SheetLang, type SheetWhere } from "@/features/orders/lib/job-sheet";
import { sheetWhere } from "@/features/supplier-orders/lib/after-send";

/**
 * Where an order's pieces are and the language their job sheet opens on: the supplier holding
 * them (their order and due day, `order_workshop_pieces`, readable by every member of order staff
 * with no amount) in that supplier's language, else the store's own workshop while the order is
 * at the workshop, else nothing, in the screen's language. A member of staff the reader refuses
 * starts on the screen's language and can still choose.
 */
export function useOrderWorkshop(
  brandId: string,
  orderId: string,
  screenLang: "ar" | "en",
  { atWorkshop = false }: { atWorkshop?: boolean } = {},
): { sheetLang: SheetLang; where: SheetWhere | null } {
  const piecesQ = useQuery({
    ...workshopQueries.orderPieces(brandId, orderId),
    retry: false,
  });
  const pieces = piecesQ.data ?? [];
  const where = sheetWhere(pieces, { atWorkshop });
  const holder =
    [...pieces].reverse().find((p) => p.receivedQuantity < p.quantity) ?? pieces.at(-1);
  return {
    sheetLang: sheetLanguageFor({ vendorLang: holder?.language, screenLang }),
    where,
  };
}
