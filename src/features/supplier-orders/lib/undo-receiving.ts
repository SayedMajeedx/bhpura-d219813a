import { piecesLabel, type SupplierOrderLine } from "./order-state";

/**
 * Undoing a supplier order's receiving (`undo_purchase_order_receipts`, migration
 * `20261113100000`): what it takes out of the stock and what the merchant reads.
 */

export type UndoMode = "take_out" | "what_is_left" | "leave";

type Receipt = {
  id: string;
  item_id: string;
  variant_id: string | null;
  quantity: number;
  undone_at?: string | null;
};

export type UndoResult = {
  status: string;
  repeated: boolean;
  receipts?: number;
  pieces?: number;
  taken_out?: number;
  costs_kept?: number;
};

/**
 * The receipts that can be undone here: still standing, and not a customer's piece (its order's
 * stage and cost moved with it; the database refuses it, RECEIPT_IS_A_CUSTOMER_PIECE).
 */
export function undoableReceipts<R extends Receipt>(
  receipts: readonly R[],
  lines: readonly Pick<SupplierOrderLine, "id" | "order_item_id">[],
): R[] {
  const customerLines = new Set(lines.filter((l) => l.order_item_id).map((l) => l.id));
  return receipts.filter((r) => !r.undone_at && !customerLines.has(r.item_id));
}

/**
 * What undoing these receipts does to the store's stock: the pieces that would leave it, and how
 * many of them it still holds, size by size (a piece sold, counted out or at a partner is gone).
 * `storeStock` is a size's own stock in the store (`stock_main`), as the database reads it.
 */
export function undoStock(
  receipts: readonly Receipt[],
  storeStock: (variantId: string) => number,
): { pieces: number; held: number; short: boolean } {
  const bySize = new Map<string, number>();
  for (const r of receipts) {
    if (r.variant_id) bySize.set(r.variant_id, (bySize.get(r.variant_id) ?? 0) + r.quantity);
  }
  let pieces = 0;
  let held = 0;
  for (const [variant, count] of bySize) {
    pieces += count;
    held += Math.min(count, Math.max(0, storeStock(variant) || 0));
  }
  return { pieces, held, short: held < pieces };
}

/** What the merchant reads once it is done. */
export function undoneMessage(result: UndoResult, mode: UndoMode, lang: "ar" | "en"): string {
  const isAr = lang === "ar";
  const pieces = result.pieces ?? 0;
  const out = result.taken_out ?? 0;
  const parts = [
    isAr
      ? `أُلغي الاستلام: ${piecesLabel(pieces, lang)}.`
      : `Receiving of ${piecesLabel(pieces, lang)} undone.`,
  ];
  if (mode === "leave") {
    parts.push(isAr ? "بقي المخزون كما هو." : "The stock was left as it is.");
  } else if (out === pieces) {
    parts.push(
      isAr ? "خرجت من المخزون." : pieces === 1 ? "It left the stock." : "They left the stock.",
    );
  } else {
    parts.push(
      isAr
        ? `خرج من المخزون ما بقي منها (${piecesLabel(out, lang)})، والباقي كان قد خرج من قبل.`
        : `What was left of them left the stock (${piecesLabel(out, lang)}); the rest had gone already.`,
    );
  }
  if ((result.costs_kept ?? 0) > 0) {
    parts.push(
      isAr
        ? "تغيّرت تكلفة مقاس بعد الاستلام، فبقيت كما هي."
        : "A size's cost changed after it arrived, so it was kept.",
    );
  }
  return parts.join(" ");
}
