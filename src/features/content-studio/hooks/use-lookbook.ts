import { useCallback, useMemo, useState } from "react";
import {
  lookbookEntries,
  lookbookProducts,
  toggleLookbookPick,
} from "@/features/content-studio/lib/lookbook";
import type { Product } from "@/features/content-studio/lib/studio-content";

/**
 * The products in the Lookbook template: the merchant's picks (the chosen
 * product and the next ones with a photo until they pick), and the entries
 * the template draws. `collection` is null unless the lookbook is showing.
 */
export function useLookbook({
  active,
  products,
  variants,
  leadId,
  isAr,
}: {
  active: boolean;
  products: readonly Product[];
  variants: ReadonlyArray<{ product_id: string; selling_price: number | null }>;
  leadId: string | null | undefined;
  isAr: boolean;
}) {
  const [picks, setPicks] = useState<readonly string[]>([]);
  const lookbook = useMemo(
    () => lookbookProducts(products, picks, leadId),
    [products, picks, leadId],
  );
  const lookbookIds = useMemo(() => lookbook.map((product) => product.id), [lookbook]);
  const toggleLookbookProduct = useCallback(
    (id: string) =>
      // The first tap starts from what is showing, so it adds to or trims the defaults.
      setPicks((current) => toggleLookbookPick(current.length > 0 ? current : lookbookIds, id)),
    [lookbookIds],
  );
  const collection = useMemo(
    () => (active ? lookbookEntries(lookbook, variants, isAr ? "ar" : "en") : null),
    [active, lookbook, variants, isAr],
  );
  return { lookbookIds, toggleLookbookProduct, collection };
}
