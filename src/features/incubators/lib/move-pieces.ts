import { pieceName } from "@/features/incubators/lib/partner-stock";
import type { Incubator, StockItem } from "@/features/incubators/types";
import type { MoveItem } from "@/lib/data/incubators";

/**
 * Moving pieces from one partner shop to another (the owner's request of 2026-11-17): which
 * pieces can go, what each starts at, what stops the move and what is sent. The database moves
 * them (`move_stock_between_incubators`); these rules only shape the dialog.
 */

type Lang = "ar" | "en";

/** A batch's number as staff and partners read it: "TR-0007". */
export function transferLabel(number: number): string {
  return `TR-${String(Math.max(0, Math.trunc(number))).padStart(4, "0")}`;
}

/** One piece the dialog offers: what the first partner holds, and what it goes at. */
export type MoveRow = {
  variantId: string;
  name: string;
  sku: string | null;
  /** The code it carries at the partner it leaves. */
  currentCode: string | null;
  /** How many the first partner holds free (orders and pickups already left the count). */
  held: number;
  chosen: boolean;
  quantity: number;
  /** At the partner receiving it. */
  price: number;
  code: string;
};

/** The partners a move can go to: active ones, never the partner it leaves. */
export function moveTargets(partners: readonly Incubator[], fromId: string | null) {
  return partners.filter((partner) => partner.is_active && partner.id !== fromId);
}

/**
 * The first partner's pieces, each starting chosen at all it holds, priced at the store's
 * selling price (else what the first partner sold it at) and coded with our SKU (the owner's
 * choice: the new partner's code is ours until changed).
 */
export function moveRows(stock: readonly StockItem[], fromId: string, lang: Lang): MoveRow[] {
  return stock
    .filter((item) => item.incubator_id === fromId && Number(item.quantity) > 0)
    .map((item) => {
      const variant = item.product_variants;
      const selling = Number(variant?.selling_price ?? 0);
      return {
        variantId: item.variant_id,
        name: pieceName(variant, lang),
        sku: variant?.sku?.trim() || null,
        currentCode: item.external_code?.trim() || null,
        held: Number(item.quantity),
        chosen: true,
        quantity: Number(item.quantity),
        price: selling > 0 ? selling : Number(item.consignment_price ?? 0),
        code: variant?.sku?.trim() ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/** The pieces chosen to go, each at least one piece. */
export function chosenRows(rows: readonly MoveRow[]) {
  return rows.filter((row) => row.chosen && row.quantity > 0);
}

/** How many pieces go, and what they are worth at the new partner's prices. */
export function moveTotals(rows: readonly MoveRow[]) {
  const chosen = chosenRows(rows);
  return {
    lines: chosen.length,
    pieces: chosen.reduce((sum, row) => sum + row.quantity, 0),
    value: chosen.reduce((sum, row) => sum + row.quantity * row.price, 0),
  };
}

/** What stops the move, in the reader's words; null when it can go. */
export function moveProblem(
  rows: readonly MoveRow[],
  targetId: string | null,
  lang: Lang,
): string | null {
  const ar = lang === "ar";
  if (!targetId)
    return ar
      ? "اختر المحل الشريك الذي ستُنقل إليه القطع"
      : "Choose the partner shop the pieces go to";
  const chosen = chosenRows(rows);
  if (chosen.length === 0) return ar ? "اختر قطعة واحدة على الأقل" : "Choose at least one piece";
  const over = chosen.find((row) => !Number.isInteger(row.quantity) || row.quantity > row.held);
  if (over) {
    return ar
      ? `${over.name}: الكمية أكبر مما عند المحل الشريك (${over.held})`
      : `${over.name}: more than the partner holds (${over.held})`;
  }
  const unpriced = chosen.find((row) => !(row.price >= 0) || !Number.isFinite(row.price));
  if (unpriced)
    return ar ? `${unpriced.name}: السعر غير صحيح` : `${unpriced.name}: the price is not valid`;
  if (chosen.length > 500) {
    return ar
      ? "عدد الأصناف كبير على نقل واحد؛ قسّمه على نقلين"
      : "Too many different pieces for one move; do it in two";
  }
  return null;
}

/** What the database is sent: the chosen pieces with their price and code at the new partner. */
export function movePayload(rows: readonly MoveRow[]): MoveItem[] {
  return chosenRows(rows).map((row) => ({
    variantId: row.variantId,
    quantity: row.quantity,
    price: Math.max(0, row.price),
    externalCode: row.code.trim() || null,
  }));
}
