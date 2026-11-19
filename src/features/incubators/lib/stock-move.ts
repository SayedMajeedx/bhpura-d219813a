/**
 * Pieces going somewhere, the one shape the partner page's three flows share (the owner's
 * request of 2026-11-19): sending them to a partner, moving them to another partner and bringing
 * them back to the store. Each flow turns its own rows into these, and one picker
 * (`StockMovePicker`) and one review (`StockMoveReview`) draw them.
 */

/** One size that can go: how many there are to take, and what is chosen. */
export type PickRow = {
  variantId: string;
  /** The product, to group its sizes under it. */
  productKey: string;
  product: string;
  /** The size and colour that tell it apart; none for a product sold with no options. */
  option: string | null;
  /** The most that can go (what is on the shelf, or what the partner holds free). */
  available: number;
  /** A line under the size: our code, or the code the partner gave it. */
  note?: string | null;
  chosen: boolean;
  quantity: number;
  /** At the place it goes (send and move only). */
  price?: number;
  code?: string;
};

/** A product's sizes together, in the list's order, with how many of them can go. */
export function pickGroups<T extends PickRow>(rows: readonly T[]) {
  const groups: Array<{ key: string; product: string; available: number; rows: T[] }> = [];
  for (const row of rows) {
    const group = groups.find((item) => item.key === row.productKey);
    if (group) {
      group.rows.push(row);
      group.available += row.available;
    } else {
      groups.push({
        key: row.productKey,
        product: row.product,
        available: row.available,
        rows: [row],
      });
    }
  }
  return groups;
}

/** The sizes chosen to go, each at least one piece. */
export function chosenPicks<T extends PickRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.chosen && row.quantity > 0);
}

/** How many sizes and pieces go, and what they are worth at their price there. */
export function pickTotals(rows: readonly PickRow[]) {
  const chosen = chosenPicks(rows);
  return {
    lines: chosen.length,
    pieces: chosen.reduce((sum, row) => sum + row.quantity, 0),
    value: chosen.reduce((sum, row) => sum + row.quantity * (row.price ?? 0), 0),
  };
}

/**
 * Choosing or leaving a set of sizes. A size with nothing to take is never chosen, and one
 * chosen with no pieces set takes all it has (a stepper at 0 would send nothing).
 */
export function choosePicks<T extends PickRow>(
  rows: readonly T[],
  variantIds: ReadonlySet<string>,
  chosen: boolean,
): T[] {
  return rows.map((row) => {
    if (!variantIds.has(row.variantId)) return row;
    if (!chosen) return { ...row, chosen: false };
    if (row.available <= 0) return row;
    return { ...row, chosen: true, quantity: row.quantity > 0 ? row.quantity : row.available };
  });
}

/** Whether every size of these that has pieces is chosen, some are, or none. */
export function chosenState(rows: readonly PickRow[]): boolean | "indeterminate" {
  const takeable = rows.filter((row) => row.available > 0);
  const chosen = takeable.filter((row) => row.chosen);
  if (takeable.length > 0 && chosen.length === takeable.length) return true;
  return chosen.length > 0 ? "indeterminate" : false;
}
