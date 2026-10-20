/**
 * A product's cost in parts (the material, the making, the extras), as the store thinks of what
 * a piece costs it. The parts are kept on the product's cost (`product_costs.cost_parts`) and the
 * cost is their sum, which the database writes (`product_costs_parts`, migration
 * `20261019120000`); this is what the editor and the missing-costs sheet show and send.
 */

export type CostPart = { label: string; amount: number };

/** What a form holds for a part while it is typed. */
export type CostPartRow = { key: string; label: string; amount: string };

/** The most parts one cost holds, and the longest name of a part (the database's limits). */
export const MAX_PARTS = 12;
export const MAX_PART_LABEL = 60;

/** Parts a store adds in one tap: words that fit any store, not one kind of shop. */
export const SUGGESTED_PARTS: ReadonlyArray<{ ar: string; en: string }> = [
  { ar: "الخامة", en: "Material" },
  { ar: "المصنعية", en: "Making" },
  { ar: "الإكسسوارات", en: "Accessories" },
  { ar: "التوصيل", en: "Delivery" },
];

let keys = 0;
export const partKey = () => `part${++keys}`;

/** Money to the fils, as the database's `round(x, 3)`. */
const fils = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

/** The parts a product's cost row holds, or null when its cost is one number. */
export function storedParts(value: unknown): CostPart[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts = value.flatMap((entry) => {
    const part = entry as { label?: unknown; amount?: unknown } | null;
    return typeof part?.label === "string" && typeof part.amount === "number"
      ? [{ label: part.label, amount: part.amount }]
      : [];
  });
  return parts.length ? parts : null;
}

export function rowsFrom(parts: readonly CostPart[] | null): CostPartRow[] | null {
  if (!parts?.length) return null;
  return parts.map((part) => ({ key: partKey(), label: part.label, amount: String(part.amount) }));
}

/** The cost the parts add up to (a part not yet a number counts as nothing). */
export function partsTotal(rows: readonly CostPartRow[]): number {
  return fils(
    rows.reduce((sum, row) => {
      const amount = Number(row.amount);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0),
  );
}

/** The parts the database would refuse, by key: a part needs a name and an amount of 0 or more. */
export function partProblems(rows: readonly CostPartRow[]): Set<string> {
  const bad = new Set<string>();
  for (const row of rows) {
    const amount = Number(row.amount.trim());
    const blank = !row.label.trim() && !row.amount.trim();
    if (blank) continue;
    if (
      !row.label.trim() ||
      row.label.trim().length > MAX_PART_LABEL ||
      row.amount.trim() === "" ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      bad.add(row.key);
    }
  }
  return bad;
}

/** The parts to save: empty rows dropped; null when there is none left (the cost is one number). */
export function partsToSave(rows: readonly CostPartRow[] | null): CostPart[] | null {
  if (!rows) return null;
  const parts = rows
    .filter((row) => row.label.trim() || row.amount.trim())
    .map((row) => ({ label: row.label.trim(), amount: fils(Number(row.amount)) }));
  return parts.length ? parts : null;
}

/** Whether the parts to save differ from those saved (so the editor writes them only then). */
export function partsChanged(saved: readonly CostPart[] | null, next: readonly CostPart[] | null) {
  return JSON.stringify(saved ?? null) !== JSON.stringify(next ?? null);
}

/** What a sale leaves after the piece's cost, and what share of the price that is. */
export function margin(price: number, cost: number) {
  if (!(price > 0)) return null;
  const amount = fils(price - cost);
  return { amount, percent: Math.round((amount / price) * 100) };
}
