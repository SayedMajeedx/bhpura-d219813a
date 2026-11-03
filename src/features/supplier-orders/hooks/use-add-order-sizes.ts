import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/auth/session";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { catalogKeys, restoreVariant } from "@/lib/data/catalog";
import { addSizesToProduct } from "@/features/inventory/lib/add-sizes";
import { leftoverMessage, type FirstSizes } from "@/features/inventory/lib/first-sizes";
import type { CatalogProduct, CatalogVariant } from "../lib/catalog";
import { newSizePrice, newSizeRow, type SizePlan } from "../lib/new-sizes";

/**
 * Adds the sizes asked for to a product from inside a supplier's order: an archived one comes back
 * with its history, the new ones are made by the inventory's own rule (`addSizesToProduct`), at the
 * price the product's sizes share and with no stock (receiving adds the pieces and their cost).
 * The catalog is read again, so the order's card shows them at once. Answers the id of every size
 * asked for (one the product had included), or null when nothing could be saved.
 */
export function useAddOrderSizes(brandId: string, isAr: boolean) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const add = async ({
    product,
    inUse,
    plan,
    first,
    becomeAt,
  }: {
    product: CatalogProduct;
    inUse: readonly CatalogVariant[];
    plan: readonly SizePlan[];
    first: FirstSizes;
    /** Which of the new sizes the product's default becomes (`first.kind === "become"`). */
    becomeAt: number;
  }): Promise<string[] | null> => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) return null;
      for (const entry of plan) {
        if (entry.kind === "restore") await restoreVariant(entry.variantId);
      }
      const made = plan.filter((entry) => entry.kind === "new");
      let madeIds: string[] = [];
      if (made.length > 0) {
        const price = newSizePrice(inUse, Number(product.base_price ?? 0));
        const result = await addSizesToProduct({
          brandId,
          first,
          becomeAt,
          sizes: made.map((entry) => ({
            user_id: user.id,
            brand_id: brandId,
            product_id: product.id,
            ...newSizeRow(entry.choice, inUse, price),
            cost_price: Number(product.cost_price ?? 0),
          })),
        });
        madeIds = result.ids;
        if (result.leftover) toast.error(leftoverMessage(isAr));
      }
      await qc.refetchQueries({ queryKey: catalogKeys.variants(brandId) });
      let next = 0;
      return plan.map((entry) => (entry.kind === "new" ? madeIds[next++] : entry.variantId));
    } catch (error) {
      toast.error(isAr ? "تعذرت إضافة المقاسات." : "The sizes could not be added.", {
        description: getFriendlyErrorMessage(error),
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { add, saving };
}
