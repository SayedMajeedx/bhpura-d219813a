import { roundCost } from "./landed-cost";
import {
  REST_OF_BILL,
  costLocked,
  formKey,
  type FormCost,
  type FormProduct,
  type SupplierOrderForm,
} from "./order-form";

/**
 * The supplier's bill total: what a tailor writes on one paper for the whole order. A store that
 * knows only the bill shares it over the pieces (equally, or by each piece's selling price); a
 * store that typed each piece's cost has the bill checked against them, and the difference
 * becomes "the rest of the bill" (material, delivery), shared over the pieces like any other cost
 * of the order. Nothing here is stored apart: the order's total is its lines, the bill included.
 */

const amount = (text: string) => {
  const n = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(n) ? n : 0;
};
const pieceCount = (product: FormProduct) =>
  Object.values(product.sizes).reduce((sum, size) => {
    const n = Number(size.quantity);
    return sum + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);

/** The bill as typed, or null when none is (or it is not a number above zero). */
export function billAmount(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? roundCost(n) : null;
}

export type BillSummary = {
  /** The pieces at their cost per piece. */
  pieces: number;
  /** The order's other costs, the rest of the bill aside. */
  others: number;
  /** The rest of the bill as it stands. */
  rest: number;
  /** The order's total: pieces, other costs and the rest of the bill. */
  total: number;
  /** The bill less the total: above zero, something on the bill is not in the order yet. */
  difference: number;
  /** Pieces in the order. */
  count: number;
};

export function billSummary(form: SupplierOrderForm, bill: number): BillSummary {
  const pieces = roundCost(
    form.products.reduce((sum, p) => sum + roundCost(pieceCount(p) * amount(p.unitCost)), 0),
  );
  const others = roundCost(
    form.costs.filter((c) => !c.rest).reduce((sum, c) => sum + amount(c.amount), 0),
  );
  const rest = roundCost(
    form.costs.filter((c) => c.rest).reduce((sum, c) => sum + amount(c.amount), 0),
  );
  const total = roundCost(pieces + others + rest);
  const count = form.products.reduce((sum, p) => sum + pieceCount(p), 0);
  return { pieces, others, rest, total, difference: roundCost(bill - total), count };
}

/** The form with its rest-of-bill line set to `value` (removed at zero). */
function withRest(form: SupplierOrderForm, value: number, isAr: boolean): SupplierOrderForm {
  const existing = form.costs.find((c) => c.rest);
  const others = form.costs.filter((c) => !c.rest);
  if (value <= 0) return { ...form, costs: others };
  const line: FormCost = existing
    ? { ...existing, amount: String(roundCost(value)) }
    : {
        key: formKey(),
        description: isAr ? REST_OF_BILL.ar : REST_OF_BILL.en,
        amount: String(roundCost(value)),
        rest: true,
      };
  return { ...form, costs: [...others, line] };
}

/**
 * Puts the difference between the bill and the order on the rest-of-bill line, so the order adds
 * up to the bill. Null when the order is already more than the bill (a cost was typed too high).
 */
export function settleBill(
  form: SupplierOrderForm,
  bill: number,
  isAr: boolean,
): SupplierOrderForm | null {
  const { pieces, others } = billSummary(form, bill);
  const rest = roundCost(bill - pieces - others);
  if (rest < 0) return null;
  return withRest(form, rest, isAr);
}

export type ShareBy = "equal" | "price";

/**
 * Shares the bill (less the order's other costs) over the pieces: the same cost for every piece,
 * or in proportion to each product's selling price. A product whose pieces have started to arrive
 * keeps its cost. What rounding to the fils leaves goes to the rest of the bill. Null when there
 * is no piece to share it over, or the other costs are more than the bill.
 */
export function shareBill(
  form: SupplierOrderForm,
  bill: number,
  by: ShareBy,
  priceOf: (productId: string) => number,
  isAr: boolean,
): SupplierOrderForm | null {
  const { others } = billSummary(form, bill);
  const locked = form.products.filter(costLocked);
  const open = form.products.filter((p) => !costLocked(p) && pieceCount(p) > 0);
  const fixed = locked.reduce((sum, p) => sum + roundCost(pieceCount(p) * amount(p.unitCost)), 0);
  const toShare = roundCost(bill - others - fixed);
  if (open.length === 0 || toShare < 0) return null;

  const weight = (p: FormProduct) => (by === "price" ? Math.max(0, priceOf(p.productId)) : 1);
  const weighted = open.reduce((sum, p) => sum + pieceCount(p) * weight(p), 0);
  // Prices not known for every product: share equally rather than leave a product at nothing.
  const useWeights = weighted > 0 && open.every((p) => weight(p) > 0);
  const totalWeight = useWeights ? weighted : open.reduce((sum, p) => sum + pieceCount(p), 0);

  const shared = new Map(
    open.map((p) => {
      const share = useWeights ? weight(p) : 1;
      // Rounded down to the fils, so the pieces never add up to more than the bill.
      const unit = Math.floor((toShare * share * 1000) / totalWeight) / 1000;
      return [p.key, unit];
    }),
  );
  const products = form.products.map((p) =>
    shared.has(p.key) ? { ...p, unitCost: String(shared.get(p.key)) } : p,
  );
  return settleBill({ ...form, products }, bill, isAr);
}
