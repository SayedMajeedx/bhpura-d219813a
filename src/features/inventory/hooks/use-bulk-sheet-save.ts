import { useState } from "react";
import { adjustVariantStock, updateProducts, updateVariant } from "@/lib/data/catalog";
import type { SheetSavePlan } from "@/features/inventory/lib/bulk-sheet";
import { getFriendlyErrorMessage } from "@/lib/utils";

/** Writes sent at once: enough to be quick, few enough not to crowd the database. */
const AT_ONCE = 4;

async function inTurns<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += AT_ONCE) {
    await Promise.all(items.slice(i, i + AT_ONCE).map(run));
  }
}

export type SheetSaveResult = {
  /** The sizes whose change did not save (their edits stay in the sheet). */
  failedVariants: Set<string>;
  failedProducts: number;
  /** The first reason each kind of write gave, for the merchant. */
  errors: string[];
  saved: number;
};

/**
 * Saves the sheet's reviewed changes with the product editor's own writes: a size's price,
 * "was" price and cost with `updateVariant` (the database keeps a cost as it is for staff who may
 * not see costs), its stock through the ledger as a count correction (`rpc_adjust_variant_stock`:
 * the number typed is what is on the shelf), and a product shown or hidden with `updateProducts`.
 * A write that fails leaves the others saved and its own edit in the sheet.
 */
export function useBulkSheetSave(brandId: string) {
  const [saving, setSaving] = useState(false);

  const save = async (plan: SheetSavePlan, note: string): Promise<SheetSaveResult> => {
    setSaving(true);
    const failedVariants = new Set<string>();
    const errors = new Set<string>();
    let failedProducts = 0;
    let saved = 0;
    const fail = (error: unknown) => errors.add(getFriendlyErrorMessage(error));
    try {
      await inTurns(plan.variants, async ({ variantId, patch }) => {
        try {
          await updateVariant(brandId, variantId, patch);
          saved += 1;
        } catch (error) {
          failedVariants.add(variantId);
          fail(error);
        }
      });
      await inTurns(plan.stock, async ({ variantId, value }) => {
        try {
          await adjustVariantStock({
            variantId,
            location: "main",
            mode: "set",
            value,
            reason: "correction",
            note,
          });
          saved += 1;
        } catch (error) {
          failedVariants.add(variantId);
          fail(error);
        }
      });
      for (const [ids, isActive] of [
        [plan.show, true],
        [plan.hide, false],
      ] as const) {
        if (!ids.length) continue;
        try {
          await updateProducts(brandId, ids, { is_active: isActive });
          saved += ids.length;
        } catch (error) {
          failedProducts += ids.length;
          fail(error);
        }
      }
    } finally {
      setSaving(false);
    }
    return { failedVariants, failedProducts, errors: [...errors], saved };
  };

  return { save, saving };
}
