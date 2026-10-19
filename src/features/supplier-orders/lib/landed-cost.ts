/**
 * What a piece from a supplier's order really cost, and what a size costs once it arrives.
 *
 * The twins of the database's `purchase_order_landed_unit_cost` and the average in
 * `receive_purchase_order` (migration `20261019100000`), for the screens' preview: the database
 * decides, and `tests/supplier-orders-migration.test.ts` runs both on the same order.
 */

/** Money to the fils, as the database's `round(x, 3)`. */
export function roundCost(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(value) + Number.EPSILON) * 1000)) / 1000;
}

export type CostLine = {
  id: string;
  /** A line that names a size (a piece to receive); otherwise a cost of the whole order. */
  isPiece: boolean;
  quantity: number;
  unitCost: number;
};

/**
 * Each piece line's cost per piece with its share of the order's other costs (fabric the store
 * bought, delivery, a price for the whole batch): in proportion to the pieces' own cost, or by
 * count when no piece carries a cost of its own.
 */
export function landedUnitCosts(lines: readonly CostLine[]): Map<string, number> {
  const total = (rows: readonly CostLine[]) =>
    rows.reduce((sum, line) => sum + roundCost(line.quantity * line.unitCost), 0);
  const pieces = lines.filter((line) => line.isPiece);
  const extras = total(lines.filter((line) => !line.isPiece));
  const piecesValue = total(pieces);
  const count = pieces.reduce((sum, line) => sum + line.quantity, 0);

  return new Map(
    pieces.map((line) => {
      const share =
        extras === 0 || count === 0
          ? 0
          : piecesValue > 0
            ? (extras * line.unitCost) / piecesValue
            : extras / count;
      return [line.id, roundCost(line.unitCost + share)];
    }),
  );
}

/**
 * A size's cost after pieces arrive: the average of what was on hand and what arrived. A size
 * with no cost yet, or nothing on hand, takes the new pieces' cost.
 */
export function averageCost({
  onHand,
  costBefore,
  received,
  unitCost,
}: {
  onHand: number;
  costBefore: number;
  received: number;
  unitCost: number;
}): number {
  const shelf = Math.max(0, onHand);
  if (costBefore <= 0 || shelf <= 0) return roundCost(unitCost);
  return roundCost((shelf * costBefore + received * unitCost) / (shelf + received));
}
