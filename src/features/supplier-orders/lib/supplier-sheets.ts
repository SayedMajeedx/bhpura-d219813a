import {
  sheetPieces,
  type JobSheetArgs,
  type JobSheetLine,
  type JobSheetProduct,
  type Lang,
  type SheetLang,
} from "@/features/orders/lib/job-sheet";
import type { OrderNumberFormat } from "@/lib/order-number";
import type { SupplierOrder } from "./order-state";

/**
 * Every customer's piece on a supplier's order as job sheets, one per customer's order, for one
 * print (step 2 of `docs/workshop-flow-plan.md`): the supplier order page's "Print job sheets",
 * and a batch sent from "Pieces to make". Each sheet says who has the pieces and by when; it
 * carries no customer's name (the supplier order names a customer by order number alone) and no
 * money. Pure.
 */
export function supplierOrderSheets({
  order,
  details,
  products,
  sheetLang,
  brand,
  workshop,
  numberFormat,
  onlyOrderItemIds,
  brandAddons,
  storeVertical,
}: {
  order: Pick<SupplierOrder, "vendor_name" | "po_number" | "expected_at" | "items">;
  /** The customers' order lines on it, as `supplierOrderQueries.pieceDetails` reads them. */
  details: ReadonlyArray<JobSheetLine & { id: string }>;
  products: readonly JobSheetProduct[];
  sheetLang: SheetLang;
  brand: string;
  workshop: Record<Lang, string>;
  numberFormat?: OrderNumberFormat | null;
  /** Only these pieces (a batch just sent); all of the order's otherwise. */
  onlyOrderItemIds?: readonly string[];
  brandAddons?: unknown[] | null;
  storeVertical?: string | null;
}): JobSheetArgs[] {
  const wanted = onlyOrderItemIds ? new Set(onlyOrderItemIds) : null;
  const byOrder = new Map<string, { number: string | number; lines: JobSheetLine[] }>();
  for (const line of [...order.items].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!line.order_item_id || (wanted && !wanted.has(line.order_item_id))) continue;
    const detail = details.find((d) => d.id === line.order_item_id);
    if (!detail) continue;
    const key = line.customer_order?.id ?? line.order_item_id;
    const entry = byOrder.get(key) ?? {
      number: line.customer_order?.invoice_number ?? "",
      lines: [],
    };
    // A piece sent is made to order, whatever its line says.
    entry.lines.push({ ...detail, location: "custom" });
    byOrder.set(key, entry);
  }

  const where = {
    supplier: order.vendor_name || null,
    poNumber: order.po_number || null,
    expectedAt: order.expected_at,
  };
  return [...byOrder.values()].map(({ number, lines }) => {
    const read = sheetPieces(lines, products, { lang: sheetLang, brandAddons, storeVertical });
    const common = {
      brand,
      orderNumber: number,
      numberFormat,
      orderDate: null,
      customerName: null,
      orderNote: null,
      where,
    };
    return read.lang === "both"
      ? { ...common, lang: "both" as const, workshop, pieces: read.pieces }
      : { ...common, lang: read.lang, workshop: workshop[read.lang], pieces: read.pieces };
  });
}
