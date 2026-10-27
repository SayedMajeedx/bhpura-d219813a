import { isWorkshopLine, type JobSheetLine } from "@/features/orders/lib/job-sheet";
import { roundCost } from "./landed-cost";
import type { SupplierOrderStatus } from "./order-state";
import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";

/**
 * A customer's made-to-order pieces and the tailor: which of an order's lines go to the workshop,
 * what each is suggested to cost this time, what a send asks the database, and where the pieces
 * already sent stand. The tailor's price changes from piece to piece and tailor to tailor, so a
 * cost is always typed for the send; the suggestion is only where it starts.
 */

export type CustomerLine = JobSheetLine & { id?: string; unit_cost?: number | null };

/** The order's lines a tailor makes, that are saved (have an id) and are not with a supplier. */
export function linesToSend<L extends CustomerLine>(
  lines: readonly L[],
  alreadySent: ReadonlySet<string>,
): Array<L & { id: string }> {
  return lines.filter(
    (line): line is L & { id: string } =>
      Boolean(line.id) && isWorkshopLine(line) && !alreadySent.has(line.id as string),
  );
}

/**
 * Where a piece's cost starts: what this tailor last charged for the product, else the product's
 * own cost, else the cost the order line already carries. Empty when none is known.
 */
export function suggestedCost(
  line: CustomerLine,
  lastPrices: ReadonlyMap<string, number>,
  productCost: (productId: string) => number,
): string {
  const productId = line.product_id ?? "";
  const candidates = [
    productId ? lastPrices.get(productId) : undefined,
    productId ? productCost(productId) : undefined,
    line.unit_cost ?? undefined,
  ];
  const found = candidates.find((c) => typeof c === "number" && c > 0);
  return found ? String(roundCost(found)) : "";
}

export type SendForm = {
  vendorId: string;
  /** One of the supplier's open orders, or "new". */
  target: string;
  expectedAt: string;
  /** By order line id: whether it goes, and its cost this time. */
  pieces: Record<string, { send: boolean; cost: string }>;
};

export type SendProblem = "vendor" | "nothing" | { cost: string };

export function sendProblems(form: SendForm): SendProblem[] {
  const problems: SendProblem[] = [];
  if (!form.vendorId) problems.push("vendor");
  const chosen = Object.entries(form.pieces).filter(([, piece]) => piece.send);
  if (chosen.length === 0) problems.push("nothing");
  for (const [id, piece] of chosen) {
    const text = piece.cost.trim();
    const n = Number(text);
    if (text === "" || !Number.isFinite(n) || n < 0 || roundCost(n) !== n) {
      problems.push({ cost: id });
    }
  }
  return problems;
}

/** What `send_order_to_supplier` is asked: call it only on a form with no `sendProblems`. */
export function sendRequest(form: SendForm) {
  return {
    vendorId: form.vendorId,
    poId: form.target === "new" ? null : form.target,
    expectedAt: form.target === "new" && form.expectedAt ? form.expectedAt : null,
    lines: Object.entries(form.pieces)
      .filter(([, piece]) => piece.send)
      .map(([order_item_id, piece]) => ({
        order_item_id,
        unit_cost: roundCost(Number(piece.cost)),
      })),
  };
}

/** A customer's order and the lines of it that may go to the tailor in one send. */
export type SendGroup = {
  orderId: string;
  /** Its number, to head its pieces when several orders go at once. */
  invoice?: number | string | null;
  lines: readonly CustomerLine[];
};

/**
 * One send of pieces from several customers' orders: one `send_order_to_supplier` per order, in
 * order, the first making the supplier order (or naming an open one) and the rest joining it.
 * Orders with no piece chosen are left out.
 */
export function sendBatches(form: SendForm, groups: readonly SendGroup[]) {
  const request = sendRequest(form);
  const chosen = new Map(request.lines.map((line) => [line.order_item_id, line]));
  return groups
    .map((group) => ({
      orderId: group.orderId,
      lines: group.lines.flatMap((line) => {
        const picked = line.id ? chosen.get(line.id) : undefined;
        return picked ? [picked] : [];
      }),
    }))
    .filter((batch) => batch.lines.length > 0);
}

/** The supplier orders a customer's pieces can join: this supplier's, not yet fully arrived. */
export function openOrdersOf<
  O extends { vendor_id: string; status: SupplierOrderStatus; created_at: string },
>(orders: readonly O[], vendorId: string): O[] {
  return orders
    .filter(
      (o) =>
        o.vendor_id === vendorId &&
        (o.status === "draft" || o.status === "ordered" || o.status === "partially_received"),
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export type PieceWithSupplier = {
  order_item_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  po_id: string;
  po_number: string;
  expected_at: string | null;
  vendor_name: string;
};

/** A customer's order's pieces with suppliers, one entry per supplier order. */
export function piecesBySupplierOrder(pieces: readonly PieceWithSupplier[]) {
  const map = new Map<
    string,
    {
      poId: string;
      poNumber: string;
      vendorName: string;
      expectedAt: string | null;
      pieces: number;
      arrived: number;
      cost: number;
    }
  >();
  for (const piece of pieces) {
    const entry = map.get(piece.po_id) ?? {
      poId: piece.po_id,
      poNumber: piece.po_number,
      vendorName: piece.vendor_name,
      expectedAt: piece.expected_at,
      pieces: 0,
      arrived: 0,
      cost: 0,
    };
    entry.pieces += piece.quantity;
    entry.arrived += piece.received_quantity;
    entry.cost = roundCost(entry.cost + piece.quantity * piece.unit_cost);
    map.set(piece.po_id, entry);
  }
  return [...map.values()];
}

/** A customer's order, named for the tailor's side: its number, never the customer's name. */
export function customerOrderName(
  invoice: number | string | null,
  isAr: boolean,
  numberFormat?: OrderNumberFormat | null,
) {
  const number =
    invoice !== null && invoice !== undefined && invoice !== ""
      ? ` ${orderNumberLabel(invoice, numberFormat)}`
      : "";
  return isAr ? `قطعة زبون · طلب${number}` : `Customer piece · order${number}`;
}
