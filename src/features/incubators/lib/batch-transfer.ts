/**
 * Which sizes a transfer to a partner moves, and how many. Pure, so the batch transfer's
 * choices can be checked without the screen.
 *
 * A size can be ticked only while it has pieces to send (`totalAvailable`: the store's own and
 * partner pieces not yet given to a partner, what the database moves). Opened from the partner's
 * page, where every product of the store is listed, nothing starts ticked; opened from products
 * chosen in the inventory, their sizes with pieces start ticked. A sold-out size starts at 0 and
 * stays unticked, so the screen never opens on "Exceeds stock". The screen once ticked every
 * size of every product, sold-out ones at 1, with no way to untick them all.
 */

export type TransferChoice = {
  variantId: string;
  selected: boolean;
  transferQty: number;
  totalAvailable: number;
};

/** How a size starts: with all its pieces, ticked only when asked and when it has some. */
export function startingChoice(
  totalAvailable: number,
  preselect: boolean,
): Pick<TransferChoice, "selected" | "transferQty"> {
  const available = Math.max(0, totalAvailable);
  return { selected: preselect && available > 0, transferQty: available };
}

/**
 * Ticks or unticks the sizes named (all of them when `ids` is null). A size with no pieces is
 * never ticked; a ticked size asks for at least one piece and never more than it has.
 */
export function tickSizes<R extends TransferChoice>(
  rows: readonly R[],
  ids: ReadonlySet<string> | null,
  on: boolean,
): R[] {
  return rows.map((row) => {
    if (ids && !ids.has(row.variantId)) return row;
    if (!on || row.totalAvailable <= 0) return { ...row, selected: false };
    const quantity =
      row.transferQty > 0 ? Math.min(row.transferQty, row.totalAvailable) : row.totalAvailable;
    return { ...row, selected: true, transferQty: quantity };
  });
}

/** Every size with pieces, all of them. */
export function allAvailable<R extends TransferChoice>(rows: readonly R[]): R[] {
  return rows.map((row) => ({
    ...row,
    selected: row.totalAvailable > 0,
    transferQty: Math.max(0, row.totalAvailable),
  }));
}

/** The same number of each size with pieces, never more than it has. */
export function sameOfEach<R extends TransferChoice>(rows: readonly R[], quantity: number): R[] {
  return rows.map((row) =>
    row.totalAvailable > 0
      ? { ...row, selected: true, transferQty: Math.min(quantity, row.totalAvailable) }
      : { ...row, selected: false, transferQty: 0 },
  );
}

/** The ticked sizes that ask for more pieces than they have (the transfer would be refused). */
export function overAvailable<R extends TransferChoice>(rows: readonly R[]): R[] {
  return rows.filter((row) => row.selected && row.transferQty > row.totalAvailable);
}

/** Of the sizes shown, how many are ticked and how many could be. */
export function tickedCount(rows: readonly TransferChoice[]): { ticked: number; tickable: number } {
  return {
    ticked: rows.filter((row) => row.selected).length,
    tickable: rows.filter((row) => row.totalAvailable > 0).length,
  };
}

export interface BatchTransferProduct {
  id: string;
  name: string;
  name_ar?: string | null;
  category?: string | null;
  base_price?: number | string | null;
}

export interface BatchTransferVariant {
  id: string;
  product_id: string;
  sku?: string | null;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  stock_main: number;
  stock_incubator: number;
  selling_price: number;
  cost_price?: number;
  incubator_inventory?: Array<{ quantity: number; incubator_id?: string }>;
}

/** One size of the transfer as the screen holds it. */
export interface TransferRowState extends TransferChoice {
  productId: string;
  productName: string;
  category: string;
  variantLabel: string;
  size: string;
  color: string;
  sku: string;
  barcode: string;
  stockMain: number;
  stockIncubator: number;
  unallocatedInc: number;
  allocatedInc: number;
  sellingPrice: number;
  consignmentPrice: number;
  externalCode: string;
}

/**
 * The screen's sizes, one per variant: what it can send (the store's pieces and the partner
 * pieces not yet given to a partner, as the database moves them), its price, and how it starts
 * (`startingChoice`).
 */
export function transferRows(
  variants: readonly BatchTransferVariant[],
  products: readonly BatchTransferProduct[],
  isAr: boolean,
  preselect: boolean,
): TransferRowState[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return variants.map((v) => {
    const prod = byId.get(v.product_id);
    const parts = [v.size, v.color].filter(Boolean);
    const stockMain = Number(v.stock_main || 0);
    const stockIncubator = Number(v.stock_incubator || 0);
    const allocatedInc = (v.incubator_inventory ?? []).reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    const unallocatedInc = Math.max(0, stockIncubator - allocatedInc);
    const totalAvailable = stockMain + unallocatedInc;
    const price = Number(v.selling_price || prod?.base_price || 0);
    return {
      variantId: v.id,
      productId: v.product_id,
      productName: (isAr ? prod?.name_ar || prod?.name : prod?.name) || prod?.name || "",
      category: prod?.category || "",
      variantLabel: parts.length > 0 ? parts.join(" / ") : isAr ? "النسخة القياسية" : "Standard",
      size: v.size || "",
      color: v.color || "",
      sku: v.sku || v.id.slice(0, 8),
      barcode: v.barcode || "",
      stockMain,
      stockIncubator,
      unallocatedInc,
      allocatedInc,
      totalAvailable,
      sellingPrice: price,
      consignmentPrice: price,
      externalCode: "",
      ...startingChoice(totalAvailable, preselect),
    };
  });
}
