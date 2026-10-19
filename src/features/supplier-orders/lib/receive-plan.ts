import { averageCost, landedUnitCosts } from "./landed-cost";
import type { SupplierOrderLine } from "./order-state";

/**
 * Receiving a supplier's order: how many of each size arrived now, and what that does to the
 * stock and the cost before it is sent. The database (`receive_purchase_order`) decides; this is
 * what the dialog shows and sends.
 */

export type ReceiveRow = {
  itemId: string;
  variantId: string;
  ordered: number;
  received: number;
  remaining: number;
  /** A piece's cost with its share of the order's other costs. */
  unitCost: number;
  /** The store's and the partners' pieces of this size now, and its cost now. */
  onHand: number;
  costBefore: number;
};

/** The order's sizes still to come, with what the dialog needs to show for each. */
export function receiveRows(
  items: readonly SupplierOrderLine[],
  shelf: ReadonlyMap<string, { onHand: number; cost: number }>,
): ReceiveRow[] {
  const landed = landedUnitCosts(
    items.map((line) => ({
      id: line.id,
      isPiece: Boolean(line.variant_id),
      quantity: line.quantity,
      unitCost: Number(line.unit_cost) || 0,
    })),
  );
  return [...items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((line) => line.variant_id && line.received_quantity < line.quantity)
    .map((line) => {
      const now = shelf.get(line.variant_id as string);
      return {
        itemId: line.id,
        variantId: line.variant_id as string,
        ordered: line.quantity,
        received: line.received_quantity,
        remaining: line.quantity - line.received_quantity,
        unitCost: landed.get(line.id) ?? 0,
        onHand: now?.onHand ?? 0,
        costBefore: now?.cost ?? 0,
      };
    });
}

/** The dialog opens on everything still to come: the usual delivery is the whole order. */
export function allRemaining(rows: readonly ReceiveRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.itemId, String(row.remaining)]));
}

export type ReceivePreview = {
  itemId: string;
  quantity: number;
  stockAfter: number;
  costAfter: number;
};

export type ReceivePlan =
  | { ok: true; lines: Array<{ item_id: string; quantity: number }>; preview: ReceivePreview[] }
  | { ok: false; problem: "nothing" }
  | { ok: false; problem: "amount" | "too_many"; itemId: string };

/** What arrived, typed per size (blank or 0: none of it), as the request and its effect. */
export function planReceive(
  rows: readonly ReceiveRow[],
  typed: Readonly<Record<string, string>>,
): ReceivePlan {
  const lines: Array<{ item_id: string; quantity: number }> = [];
  const preview: ReceivePreview[] = [];
  for (const row of rows) {
    const text = (typed[row.itemId] ?? "").trim();
    if (text === "") continue;
    const quantity = Number(text);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return { ok: false, problem: "amount", itemId: row.itemId };
    }
    if (quantity === 0) continue;
    if (quantity > row.remaining) return { ok: false, problem: "too_many", itemId: row.itemId };
    lines.push({ item_id: row.itemId, quantity });
    preview.push({
      itemId: row.itemId,
      quantity,
      stockAfter: Math.max(0, row.onHand) + quantity,
      costAfter: averageCost({
        onHand: row.onHand,
        costBefore: row.costBefore,
        received: quantity,
        unitCost: row.unitCost,
      }),
    });
  }
  if (lines.length === 0) return { ok: false, problem: "nothing" };
  return { ok: true, lines, preview };
}
