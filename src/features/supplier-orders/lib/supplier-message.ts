import type { JobSheetPiece, JobSheetRow } from "@/features/orders/lib/job-sheet";
import { isPieceLine, type SupplierOrderLine } from "./order-state";
import { roundCost } from "./landed-cost";

/**
 * The message a person sends a supplier with an order: each piece with what makes it (size,
 * measurements, the customer's notes for the workshop, extras), and the agreed prices when the
 * store chooses to write them. No customer's name, number or address ever goes in it: a
 * customer's piece is named by its number in the supplier order alone.
 */

export type MessagePiece = {
  title: string;
  quantity: number;
  /** The size and other options, in the store's words. */
  options: JobSheetRow[];
  /** Measurements and the customer's other answers. */
  details: JobSheetRow[];
  notes: string[];
  extras: string[];
  /** The price agreed for one piece. */
  unitCost: number;
  /** A piece back for a fix or an alteration: what to do, first thing the tailor reads. */
  work?: { purpose: "fix" | "alteration"; note: string | null } | null;
};

/** "28/10/2026": a day as a message writes it, in Western digits. */
function messageDate(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

const rows = (list: JobSheetRow[]) => list.map((r) => `${r.label}: ${r.value}`).join(" · ");

export function supplierMessage({
  vendorName,
  storeName,
  poNumber,
  expectedAt,
  pieces,
  includePrices,
  money,
  lang,
}: {
  vendorName: string;
  storeName: string;
  poNumber: string;
  expectedAt: string | null;
  pieces: readonly MessagePiece[];
  includePrices: boolean;
  /** Money as the store writes it ("18.000 BHD"). */
  money: (amount: number) => string;
  lang: "ar" | "en";
}): string {
  const isAr = lang === "ar";
  const head = isAr
    ? [
        `السلام عليكم ${vendorName}،`,
        `طلبية ${storeName} رقم ${poNumber}${expectedAt ? `، التسليم ${messageDate(expectedAt)}` : ""}:`,
      ]
    : [
        `Hello ${vendorName},`,
        `${storeName}'s order ${poNumber}${expectedAt ? `, due ${messageDate(expectedAt)}` : ""}:`,
      ];

  const body = pieces.map((piece, index) => {
    const lines = [`${index + 1}) ${piece.title} × ${piece.quantity}`];
    if (piece.work) {
      const what =
        piece.work.purpose === "fix"
          ? isAr
            ? "للتصليح"
            : "To fix"
          : isAr
            ? "للتعديل"
            : "To alter";
      lines.push(piece.work.note ? `${what}: ${piece.work.note}` : what);
    }
    if (piece.options.length) lines.push(rows(piece.options));
    if (piece.details.length) lines.push(rows(piece.details));
    if (piece.notes.length) lines.push(`${isAr ? "ملاحظات" : "Notes"}: ${piece.notes.join(" · ")}`);
    if (piece.extras.length)
      lines.push(`${isAr ? "إضافات" : "Extras"}: ${piece.extras.join("، ")}`);
    if (includePrices && piece.unitCost > 0) {
      lines.push(`${isAr ? "السعر المتفق" : "Agreed price"}: ${money(piece.unitCost)}`);
    }
    return lines.join("\n");
  });

  const total = roundCost(pieces.reduce((sum, p) => sum + p.quantity * p.unitCost, 0));
  const foot: string[] = [];
  if (includePrices && total > 0) {
    foot.push(`${isAr ? "المجموع" : "Total"}: ${money(total)}`);
  }
  foot.push(isAr ? "شكراً لك." : "Thank you.");

  return [head.join("\n"), body.join("\n\n"), foot.join("\n")].join("\n\n");
}

/**
 * The order's pieces as the message lists them: a customer's piece by its job sheet (when it can
 * be read), the store's own by product and size. Costs of the order that are not pieces (fabric,
 * delivery) are the store's, and stay out of it.
 */
export function messagePieces(
  lines: readonly SupplierOrderLine[],
  read: {
    productName: (productId: string | null) => string;
    sizeName: (variantId: string | null) => string;
    customerPiece: (orderItemId: string) => JobSheetPiece | null;
  },
  lang: "ar" | "en",
): MessagePiece[] {
  return [...lines]
    .filter(isPieceLine)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((line) => {
      const sheet = line.order_item_id ? read.customerPiece(line.order_item_id) : null;
      const work =
        line.purpose === "fix" || line.purpose === "alteration"
          ? { purpose: line.purpose, note: line.work_note ?? null }
          : null;
      if (sheet) {
        return {
          title: sheet.title,
          quantity: line.quantity,
          options: sheet.options,
          details: sheet.details,
          notes: sheet.notes,
          extras: sheet.extras,
          unitCost: line.unit_cost,
          work,
        };
      }
      return {
        title: line.order_item_id ? line.description : read.productName(line.product_id),
        quantity: line.quantity,
        options:
          line.variant_id && !line.order_item_id
            ? [{ label: lang === "ar" ? "المقاس" : "Size", value: read.sizeName(line.variant_id) }]
            : [],
        details: [],
        notes: [],
        extras: [],
        unitCost: line.unit_cost,
        work,
      };
    });
}
