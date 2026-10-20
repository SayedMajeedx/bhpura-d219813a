import { roundCost } from "./landed-cost";
import type { SupplierOrder, SupplierOrderLine } from "./order-state";

/**
 * A customer's piece after it went to a supplier (migration `20261021100000`): the customer
 * cancels and the store chooses (stop it with the supplier, or keep it for sale), a faulty piece
 * goes back to be fixed for free, and an alteration goes to a tailor at their charge, which is
 * added to the piece's cost when it comes back.
 */

export type PiecePurpose = "make" | "fix" | "alteration";

/** What a line is for, as stored; anything else reads as made. */
export function piecePurpose(value: string | null | undefined): PiecePurpose {
  return value === "fix" || value === "alteration" ? value : "make";
}

/** "Fix" / "Alteration" for a piece sent back; nothing for one being made. */
export function purposeLabel(purpose: PiecePurpose | undefined, isAr: boolean): string | null {
  if (purpose === "fix") return isAr ? "تصليح" : "Fix";
  if (purpose === "alteration") return isAr ? "تعديل" : "Alteration";
  return null;
}

// -- A customer cancels --------------------------------------------------------------------------

/** What the store may do with a cancelled customer's piece on a supplier order. */
export function releaseChoices(
  line: Pick<SupplierOrderLine, "received_quantity" | "variant_id" | "purpose">,
) {
  return {
    /** Stop it with the supplier: only before it arrives. */
    stop: line.received_quantity === 0,
    /** Keep it for sale: a piece being made, in one of the store's sizes. */
    stock: (line.purpose ?? "make") === "make" && Boolean(line.variant_id),
  };
}

/** A line whose customer cancelled and that waits for the store's choice. */
export function awaitsChoice(line: SupplierOrderLine): boolean {
  return Boolean(line.order_item_id && line.customer_order?.cancelled);
}

/** The cancelled customers' pieces still on supplier orders, with their order, oldest first. */
export function piecesAwaitingChoice(orders: readonly SupplierOrder[]) {
  return orders
    .filter((order) => order.status !== "cancelled")
    .flatMap((order) => order.items.filter(awaitsChoice).map((line) => ({ order, line })))
    .sort((a, b) => (a.order.created_at < b.order.created_at ? -1 : 1));
}

// -- Back to a tailor: a fix or an alteration ---------------------------------------------------

type OrderItemLike = {
  id?: string | null;
  description?: string | null;
  title?: string | null;
  name?: string | null;
  quantity?: number | null;
  product?: { item_kind?: string | null } | null;
  products?: { item_kind?: string | null } | null;
};

/**
 * An order's saved lines as the pieces list names them: the pieces a supplier can make, fix or
 * alter. A service is never one.
 */
export function tailorPieceLines(items: ReadonlyArray<OrderItemLike> | null | undefined) {
  return (items ?? []).flatMap((item) => {
    const kind = (item.product ?? item.products)?.item_kind;
    if (!item.id || kind === "service") return [];
    const description = item.description || item.title || item.name || "";
    return [{ id: item.id, description, quantity: item.quantity || 1 }];
  });
}

/**
 * The order's pieces that never went to a supplier (a ready-made piece, or one made in the
 * store): they may go for an alteration, not for a free fix (nobody's work to put right).
 */
export function readyToAlter<L extends { id: string }>(
  lines: readonly L[],
  sent: readonly Pick<SentPiece, "order_item_id">[],
): L[] {
  const withSupplier = new Set(sent.map((piece) => piece.order_item_id));
  return lines.filter((line) => !withSupplier.has(line.id));
}

export type SentPiece = {
  order_item_id: string;
  quantity: number;
  received_quantity: number;
  purpose: PiecePurpose;
  work_note: string | null;
  po_id: string;
  po_number: string;
  vendor_id: string;
  vendor_name: string;
};

/**
 * A customer's order's pieces that went to suppliers, one entry per order line: where it is now
 * (the line still awaited, if any) and who made or last had it (the tailor a fix goes back to).
 */
export function orderPieceStates<L extends { id: string }>(
  lines: readonly L[],
  sent: readonly SentPiece[],
) {
  return lines.flatMap((line) => {
    const mine = sent.filter((piece) => piece.order_item_id === line.id);
    if (mine.length === 0) return [];
    const out = mine.find((piece) => piece.received_quantity < piece.quantity) ?? null;
    const last = out ?? mine[mine.length - 1];
    return [{ line, out, lastVendorId: last.vendor_id, lastVendorName: last.vendor_name }];
  });
}

export type BackForm = {
  purpose: "fix" | "alteration";
  vendorId: string;
  /** One of the supplier's open orders, or "new". */
  target: string;
  expectedAt: string;
  /** The tailor's charge for an alteration; a fix is free. */
  cost: string;
  /** What to fix or change: the tailor reads it. */
  note: string;
};

export type BackProblem = "vendor" | "note" | "cost";

export function backProblems(form: BackForm): BackProblem[] {
  const problems: BackProblem[] = [];
  if (!form.vendorId) problems.push("vendor");
  if (!form.note.trim()) problems.push("note");
  if (form.purpose === "alteration") {
    const text = form.cost.trim();
    const n = Number(text);
    if (text !== "" && (!Number.isFinite(n) || n < 0 || roundCost(n) !== n)) problems.push("cost");
  }
  return problems;
}

/** What `send_order_to_supplier` is asked: call it only on a form with no `backProblems`. */
export function backRequest(form: BackForm, orderItemId: string) {
  const cost = form.purpose === "alteration" && form.cost.trim() ? roundCost(Number(form.cost)) : 0;
  return {
    vendorId: form.vendorId,
    poId: form.target === "new" ? null : form.target,
    expectedAt: form.target === "new" && form.expectedAt ? form.expectedAt : null,
    lines: [
      {
        order_item_id: orderItemId,
        unit_cost: cost,
        purpose: form.purpose,
        note: form.note.trim().slice(0, 500),
      },
    ],
  };
}
