import { useMemo } from "react";
import { expectedAdvance, type AdvanceOrderSource } from "@/features/orders/lib/expected-advance";

type ProductRow = { id: string; category?: string | null };

/**
 * What the order was placed to pay now (`expectedAdvance`), with its products' categories read
 * from the catalogue the page already holds. Null for an order no advance rule reached.
 */
export function useExpectedAdvance(
  order: AdvanceOrderSource | null | undefined,
  products: readonly ProductRow[] | null | undefined,
) {
  return useMemo(
    () =>
      expectedAdvance(
        order,
        (productId) => (products ?? []).find((p) => p.id === productId)?.category ?? null,
      ),
    [order, products],
  );
}
