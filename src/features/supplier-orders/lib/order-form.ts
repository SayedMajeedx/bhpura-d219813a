import { landedUnitCosts, roundCost } from "./landed-cost";
import type { SupplierOrder, SupplierOrderLine } from "./order-state";

/**
 * The editor of a supplier's order: a product at a cost per piece with how many of each size,
 * and the order's other costs (fabric the store bought, delivery). What a save sends.
 *
 * A line whose pieces have started to arrive keeps its size and cost and cannot drop below what
 * arrived (the database refuses it too: `purchase_order_items_guard`).
 */

/** The most pieces of one size in one order. */
export const MAX_PIECES = 100_000;

export type FormSize = {
  /** The order's line for this size, when it has one already. */
  itemId?: string;
  quantity: string;
  received: number;
};

export type FormProduct = {
  key: string;
  productId: string;
  unitCost: string;
  /** By variant id (for a customer's piece, by its line's id). */
  sizes: Record<string, FormSize>;
  /**
   * A customer's piece, sent from their order: one line, its size and quantity fixed by the
   * order (only its price changes here), never stock.
   */
  customer?: {
    itemId: string;
    variantId: string | null;
    label: string;
    orderId: string | null;
    invoice: number | string | null;
  };
};

export type FormCost = {
  key: string;
  itemId?: string;
  description: string;
  amount: string;
  /** The rest of the supplier's bill, kept by the bill total (`lib/bill.ts`). */
  rest?: boolean;
};

/** The rest of the supplier's bill, as its line is named in each language. */
export const REST_OF_BILL = { ar: "باقي فاتورة المورد", en: "Rest of the supplier's bill" };
const isRestLine = (description: string) =>
  description === REST_OF_BILL.ar || description === REST_OF_BILL.en;

export type SupplierOrderForm = {
  vendorId: string;
  expectedAt: string;
  notes: string;
  products: FormProduct[];
  costs: FormCost[];
};

let keys = 0;
export const formKey = () => `k${++keys}`;

export function emptyForm(): SupplierOrderForm {
  return { vendorId: "", expectedAt: "", notes: "", products: [], costs: [] };
}

const asText = (n: number) => (Number.isFinite(n) ? String(roundCost(n)) : "0");

/** The form of an order already saved. Lines of one product share its first line's cost. */
export function formFromOrder(order: SupplierOrder): SupplierOrderForm {
  const products: FormProduct[] = [];
  const costs: FormCost[] = [];
  const sorted = [...order.items].sort((a, b) => a.sort_order - b.sort_order);
  for (const line of sorted) {
    if (line.order_item_id) {
      products.push({
        key: formKey(),
        productId: line.product_id ?? "",
        unitCost: asText(line.unit_cost),
        sizes: {
          [line.id]: {
            itemId: line.id,
            quantity: String(line.quantity),
            received: line.received_quantity,
          },
        },
        customer: {
          itemId: line.id,
          variantId: line.variant_id,
          label: line.description,
          orderId: line.customer_order?.id ?? null,
          invoice: line.customer_order?.invoice_number ?? null,
        },
      });
      continue;
    }
    if (!line.variant_id) {
      costs.push({
        key: formKey(),
        itemId: line.id,
        description: line.description,
        amount: asText(line.quantity * line.unit_cost),
        rest: isRestLine(line.description),
      });
      continue;
    }
    const productId = line.product_id ?? "";
    let group = products.find((p) => p.productId === productId && !p.customer);
    if (!group) {
      group = { key: formKey(), productId, unitCost: asText(line.unit_cost), sizes: {} };
      products.push(group);
    }
    group.sizes[line.variant_id] = {
      itemId: line.id,
      quantity: String(line.quantity),
      received: line.received_quantity,
    };
  }
  return {
    vendorId: order.vendor_id,
    expectedAt: order.expected_at ?? "",
    notes: order.notes ?? "",
    products,
    costs,
  };
}

/**
 * A product's sizes as it joins the order: one piece of each, the least an order of it can be.
 * A size the store does not want is set to 0 (or emptied), and is then not ordered.
 */
export function startingSizes(variantIds: readonly string[]): Record<string, FormSize> {
  return Object.fromEntries(variantIds.map((id) => [id, { quantity: "1", received: 0 }]));
}

/** A product's cost can no longer change once one of its sizes has received pieces. */
export const costLocked = (product: FormProduct) =>
  Object.values(product.sizes).some((size) => size.received > 0);

const amountOf = (text: string) => {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
};

const piecesOf = (text: string) => {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : NaN;
};

export type FormProblem =
  | { field: "vendor" }
  | { field: "pieces" }
  | { field: "cost"; key: string }
  | { field: "quantity"; key: string; variantId: string; min: number }
  | { field: "product"; key: string }
  | { field: "extra"; key: string };

/** What stops a save, in the order the editor shows it. */
export function formProblems(form: SupplierOrderForm): FormProblem[] {
  const problems: FormProblem[] = [];
  if (!form.vendorId) problems.push({ field: "vendor" });
  let pieces = 0;
  for (const product of form.products) {
    const cost = amountOf(product.unitCost);
    if (Number.isNaN(cost) || cost < 0) problems.push({ field: "cost", key: product.key });
    let ofProduct = 0;
    for (const [variantId, size] of Object.entries(product.sizes)) {
      const n = piecesOf(size.quantity);
      if (Number.isNaN(n) || n < size.received || n > MAX_PIECES) {
        problems.push({ field: "quantity", key: product.key, variantId, min: size.received });
        continue;
      }
      ofProduct += n;
    }
    if (ofProduct === 0) problems.push({ field: "product", key: product.key });
    pieces += ofProduct;
  }
  if (pieces === 0 && !problems.some((p) => p.field === "product")) {
    problems.push({ field: "pieces" });
  }
  for (const extra of form.costs) {
    const amount = amountOf(extra.amount);
    const blank = !extra.description.trim() && amount === 0;
    // A cost line left empty is dropped (a saved one is removed).
    if (blank) continue;
    if (!extra.description.trim() || Number.isNaN(amount) || amount <= 0) {
      problems.push({ field: "extra", key: extra.key });
    }
  }
  return problems;
}

/** What a line of the order is written as. */
export type LineValues = {
  variant_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  sort_order: number;
};

export type SavePlan = {
  order: { vendor_id: string; expected_at: string | null; notes: string | null };
  insert: LineValues[];
  update: Array<{ id: string; values: LineValues }>;
  remove: string[];
};

/**
 * The save: the order's own fields, and its lines to add, change and remove against what is
 * saved (`saved`, empty for a new order). A size left at zero is not a line; a line that has
 * received pieces is never removed. Call it only on a form with no `formProblems`.
 */
export function planSave(
  form: SupplierOrderForm,
  saved: readonly SupplierOrderLine[],
  names: { productName: (productId: string) => string; sizeName: (variantId: string) => string },
): SavePlan {
  const wanted: Array<LineValues & { id?: string }> = [];
  for (const product of form.products) {
    const unit = roundCost(Math.max(0, amountOf(product.unitCost) || 0));
    if (product.customer) {
      // A customer's piece keeps its line: only its price is the editor's.
      const size = product.sizes[product.customer.itemId];
      wanted.push({
        id: product.customer.itemId,
        variant_id: product.customer.variantId,
        description: product.customer.label,
        quantity: piecesOf(size?.quantity ?? "1") || 1,
        unit_cost: unit,
        sort_order: wanted.length,
      });
      continue;
    }
    for (const [variantId, size] of Object.entries(product.sizes)) {
      const quantity = piecesOf(size.quantity) || 0;
      if (quantity <= 0) continue;
      const size_ = names.sizeName(variantId);
      wanted.push({
        id: size.itemId,
        variant_id: variantId,
        description: [names.productName(product.productId), size_].filter(Boolean).join(" · "),
        quantity,
        unit_cost: unit,
        sort_order: wanted.length,
      });
    }
  }
  for (const extra of form.costs) {
    const amount = roundCost(amountOf(extra.amount) || 0);
    if (!extra.description.trim() || amount <= 0) continue;
    wanted.push({
      id: extra.itemId,
      variant_id: null,
      description: extra.description.trim().slice(0, 300),
      quantity: 1,
      unit_cost: amount,
      sort_order: wanted.length,
    });
  }

  const byId = new Map(saved.map((line) => [line.id, line]));
  const kept = new Set<string>();
  const insert: LineValues[] = [];
  const update: SavePlan["update"] = [];
  for (const { id, ...values } of wanted) {
    const before = id ? byId.get(id) : undefined;
    if (!before) {
      insert.push(values);
      continue;
    }
    kept.add(before.id);
    const changed =
      before.variant_id !== values.variant_id ||
      before.description !== values.description ||
      before.quantity !== values.quantity ||
      roundCost(Number(before.unit_cost)) !== values.unit_cost ||
      before.sort_order !== values.sort_order;
    if (changed) update.push({ id: before.id, values });
  }
  const remove = saved
    .filter((line) => !kept.has(line.id) && line.received_quantity === 0)
    .map((line) => line.id);

  return {
    order: {
      vendor_id: form.vendorId,
      expected_at: form.expectedAt || null,
      notes: form.notes.trim() ? form.notes.trim().slice(0, 2000) : null,
    },
    insert,
    update,
    remove,
  };
}

/** The editor's figures: pieces, the total and each product's cost per piece with its share. */
export function formFigures(form: SupplierOrderForm) {
  const lines = [
    ...form.products.map((product) => ({
      id: product.key,
      isPiece: true,
      quantity: Object.values(product.sizes).reduce(
        (sum, size) => sum + Math.max(0, piecesOf(size.quantity) || 0),
        0,
      ),
      unitCost: Math.max(0, amountOf(product.unitCost) || 0),
    })),
    ...form.costs.map((extra) => ({
      id: extra.key,
      isPiece: false,
      quantity: 1,
      unitCost: Math.max(0, amountOf(extra.amount) || 0),
    })),
  ].filter((line) => line.quantity > 0);
  const pieces = lines.filter((l) => l.isPiece).reduce((sum, l) => sum + l.quantity, 0);
  const total = roundCost(lines.reduce((sum, l) => sum + roundCost(l.quantity * l.unitCost), 0));
  const extras = roundCost(lines.filter((l) => !l.isPiece).reduce((sum, l) => sum + l.unitCost, 0));
  return { pieces, total, extras, perPiece: landedUnitCosts(lines) };
}
