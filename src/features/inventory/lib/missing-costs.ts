import { productMissingCost } from "@/features/inventory/lib/attention";
import {
  partProblems,
  partsToSave,
  partsTotal,
  type CostPart,
  type CostPartRow,
} from "./cost-parts";

/**
 * The missing-costs sheet: every product whose cost is not known, made-to-order pieces first
 * (their profit is counted on every sale and there is no stock to remind anyone), and what a
 * press of "Save" sends for each cost typed.
 */

export type MissingCostProduct = {
  id: string;
  name: string | null;
  name_ar: string | null;
  name_en: string | null;
  image_url: string | null;
  is_made_to_order?: boolean | null;
  item_kind?: string | null;
  is_package?: boolean | null;
  cost_price?: number | null;
};

export function missingCostProducts<P extends MissingCostProduct>(
  products: readonly P[],
  variantsByProduct: Readonly<Record<string, ReadonlyArray<{ cost_price?: number | null }>>>,
  lang: "ar" | "en",
): P[] {
  const name = (p: P) =>
    (lang === "ar" ? p.name_ar || p.name || p.name_en : p.name_en || p.name || p.name_ar) || "";
  return products
    .filter((product) => productMissingCost(product, variantsByProduct[product.id] ?? []))
    .sort(
      (a, b) =>
        Number(Boolean(b.is_made_to_order)) - Number(Boolean(a.is_made_to_order)) ||
        name(a).localeCompare(name(b)),
    );
}

/** What is typed for one product: one number, or its parts. */
export type CostEntry = { amount: string; parts: CostPartRow[] | null };

export type CostToSave = { productId: string; cost: { amount: number } | { parts: CostPart[] } };

/**
 * The costs to save, and the products whose entry cannot be saved. A product left empty (or at
 * zero) is skipped: a cost of nothing is what it already has.
 */
export function costsToSave(entries: Readonly<Record<string, CostEntry>>) {
  const save: CostToSave[] = [];
  const invalid: string[] = [];
  for (const [productId, entry] of Object.entries(entries)) {
    if (entry.parts) {
      if (partProblems(entry.parts).size > 0) {
        invalid.push(productId);
        continue;
      }
      const parts = partsToSave(entry.parts);
      if (parts && partsTotal(entry.parts) > 0) save.push({ productId, cost: { parts } });
      continue;
    }
    const text = entry.amount.trim();
    if (text === "") continue;
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0) {
      invalid.push(productId);
      continue;
    }
    if (amount > 0) save.push({ productId, cost: { amount: Math.round(amount * 1000) / 1000 } });
  }
  return { save, invalid };
}

/** The cost an entry adds up to (for the margin beside it), or null when nothing is typed. */
export function entryCost(entry: CostEntry | undefined): number | null {
  if (!entry) return null;
  if (entry.parts) return partsTotal(entry.parts);
  const amount = Number(entry.amount);
  return entry.amount.trim() && Number.isFinite(amount) && amount >= 0 ? amount : null;
}
