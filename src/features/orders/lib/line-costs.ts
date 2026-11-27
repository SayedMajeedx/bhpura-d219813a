/**
 * What an order's pieces cost the store, and how many have no cost recorded.
 *
 * A line's `unit_cost` is written by the database when the line is saved
 * (`snapshot_order_item_unit_cost`): its size's cost, else its product's, zero for a service, and
 * empty when nothing has a cost. An empty cost is unknown, never zero: the order page counts it
 * out of the cost and says how many pieces it left out, as the reports do (`missing_cost_units`).
 * A line typed by hand with no product is not a catalogue piece and is not counted as unknown.
 */
import { countOf } from "@/lib/arabic-count";

export type CostedLine = {
  quantity?: number | string | null;
  unit_cost?: number | string | null;
  product_id?: string | null;
  variant_id?: string | null;
};

export type LineCosts = {
  /** The cost of the pieces whose cost is known. */
  known: number;
  /** Catalogue pieces with no cost recorded. */
  unknownPieces: number;
};

export function lineCosts(lines: readonly CostedLine[]): LineCosts {
  let known = 0;
  let unknownPieces = 0;
  for (const line of lines) {
    const quantity = Number(line.quantity ?? 1) || 0;
    if (line.unit_cost == null || line.unit_cost === "") {
      if (line.product_id || line.variant_id) unknownPieces += quantity;
      continue;
    }
    known += (Number(line.unit_cost) || 0) * quantity;
  }
  return { known, unknownPieces };
}

/**
 * A size's cost as a new order line takes it: only a cost above zero is a cost. Zero or none
 * leaves the line empty, so the database fills it from the product (or marks it unknown).
 */
export function newLineCost(cost: number | string | null | undefined): number | null {
  const value = Number(cost);
  return cost != null && Number.isFinite(value) && value > 0 ? value : null;
}

/** The note under an order's profit while some of its pieces have no cost recorded. */
export function unknownCostNote(pieces: number, lang: "ar" | "en"): string {
  const count = countOf(pieces, "piece", lang);
  return lang === "ar"
    ? `بلا تكلفة مسجّلة: ${count}. الربح أعلى من حقيقته حتى تُضاف تكلفتها.`
    : `No cost recorded for ${count}, so the profit reads higher than it is until it is added.`;
}
