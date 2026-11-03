import { formatDate } from "@/lib/format";
import {
  jobSheetPieces,
  type JobSheetLine,
  type JobSheetProduct,
  type SheetLang,
  type SheetWhere,
} from "@/features/orders/lib/job-sheet";
import { messageInLanguage, supplierMessage } from "./supplier-message";
import type { WorkshopPiece } from "@/lib/data/supplier-orders/workshop";

/**
 * What follows "Send to workshop" (step 2 of `docs/workshop-flow-plan.md`): where the piece now
 * is, in a sentence and on its job sheet, and what the panel after the send offers. Pure.
 */

/**
 * Who has an order's pieces, for its job sheet: the supplier order of a piece still out (the
 * newest), else of the newest piece sent; the store's own workshop when the order is at the
 * workshop with no piece on a supplier's order; nothing when it is neither.
 */
export function sheetWhere(
  pieces: readonly WorkshopPiece[],
  { atWorkshop }: { atWorkshop: boolean },
): SheetWhere | null {
  const out = pieces.filter((p) => p.receivedQuantity < p.quantity);
  const piece = (out.length ? out : pieces).at(-1);
  if (piece) {
    return { supplier: piece.vendorName, poNumber: piece.poNumber, expectedAt: piece.expectedAt };
  }
  return atWorkshop ? { supplier: null, poNumber: null, expectedAt: null } : null;
}

/** "With Umm Ali on PO-0007, due 12 Nov 2026" / "In our workshop". */
export function whereSentence(where: SheetWhere, lang: "ar" | "en"): string {
  const isAr = lang === "ar";
  if (!where.supplier) return isAr ? "في ورشتنا" : "In our workshop";
  const due = where.expectedAt
    ? isAr
      ? `، التسليم ${formatDate(where.expectedAt, "ar-BH-u-nu-latn")}`
      : `, due ${formatDate(where.expectedAt, "en-GB")}`
    : "";
  const on = where.poNumber ? (isAr ? ` على ${where.poNumber}` : ` on ${where.poNumber}`) : "";
  return isAr ? `عند ${where.supplier}${on}${due}` : `With ${where.supplier}${on}${due}`;
}

export type AfterSendAction = "print" | "message" | "tell" | "open";

/**
 * What the panel after a send offers, in order: the job sheet (always, where it can be printed),
 * a WhatsApp message to the supplier (a supplier with a number), telling the customer (one
 * WhatsApp can reach), and the supplier order (staff who see the store's finances, who can open
 * it). The store's own workshop has no supplier to write to and no supplier order to open.
 */
export function afterSendActions({
  inHouse,
  canPrint,
  supplierPhone,
  customerReachable,
  canOpenOrder,
}: {
  inHouse: boolean;
  canPrint: boolean;
  supplierPhone: string | null | undefined;
  customerReachable: boolean;
  canOpenOrder: boolean;
}): AfterSendAction[] {
  const actions: AfterSendAction[] = [];
  if (canPrint) actions.push("print");
  if (!inHouse && (supplierPhone ?? "").trim()) actions.push("message");
  if (customerReachable) actions.push("tell");
  if (!inHouse && canOpenOrder) actions.push("open");
  return actions;
}

/**
 * The message for the supplier about pieces just sent, in their language (or both): each piece
 * from its job sheet, with no price (a member of staff who cannot see costs sends too) and no
 * customer's name, number or address.
 */
export function sentPiecesMessage({
  lines,
  products,
  vendorName,
  storeName,
  where,
  lang,
  brandAddons,
  storeVertical,
}: {
  lines: readonly JobSheetLine[];
  products: readonly JobSheetProduct[];
  vendorName: string;
  storeName: string;
  where: SheetWhere;
  lang: SheetLang;
  brandAddons?: unknown[] | null;
  storeVertical?: string | null;
}): string {
  const write = (inLang: "ar" | "en") =>
    supplierMessage({
      vendorName,
      storeName,
      poNumber: where.poNumber ?? "",
      expectedAt: where.expectedAt,
      pieces: jobSheetPieces(lines, products, { lang: inLang, brandAddons, storeVertical }).map(
        (piece) => ({ ...piece, unitCost: 0, work: null }),
      ),
      includePrices: false,
      money: () => "",
      lang: inLang,
    });
  return messageInLanguage(lang, write);
}
