import { useCallback, useMemo, useState } from "react";
import {
  COLLECTION_LIMITS,
  isCollectionTemplate,
  lookbookEntries,
  lookbookProducts,
  toggleLookbookPick,
  type CollectionLimits,
} from "@/features/content-studio/lib/lookbook";
import type { Product } from "@/features/content-studio/lib/studio-content";
import type { StoreOffer } from "@/lib/offers";

const NO_OFFERS: readonly StoreOffer[] = [];

/**
 * The products a template that shows several draws (the Lookbook, a Menu, a
 * Bundle): the merchant's picks (the chosen product and the next ones with a
 * photo until they pick), kept to the template's limits, and the entries the
 * template draws. One pick is shared, so moving between them keeps it.
 * `collection` is null unless such a template is showing.
 */
export function useLookbook({
  templateId,
  products,
  variants,
  leadId,
  isAr,
  offers = NO_OFFERS,
}: {
  templateId: string;
  products: readonly Product[];
  variants: ReadonlyArray<{
    product_id: string;
    selling_price: number | null;
    duration_minutes?: number | null;
    original_price?: number | null;
  }>;
  leadId: string | null | undefined;
  isAr: boolean;
  /** The store's live automatic offers: each piece is priced after them. */
  offers?: readonly StoreOffer[];
}) {
  const active = isCollectionTemplate(templateId);
  const limits: CollectionLimits = active
    ? COLLECTION_LIMITS[templateId]
    : COLLECTION_LIMITS["lookbook-carousel"];
  const [picks, setPicks] = useState<readonly string[]>([]);
  const lookbook = useMemo(
    () => lookbookProducts(products, picks, leadId, limits),
    [products, picks, leadId, limits],
  );
  const lookbookIds = useMemo(() => lookbook.map((product) => product.id), [lookbook]);
  const toggleLookbookProduct = useCallback(
    (id: string) =>
      // The first tap starts from what is showing, so it adds to or trims the defaults.
      setPicks((current) =>
        toggleLookbookPick(current.length > 0 ? current : lookbookIds, id, limits),
      ),
    [lookbookIds, limits],
  );
  const collection = useMemo(
    () => (active ? lookbookEntries(lookbook, variants, isAr ? "ar" : "en", offers) : null),
    [active, lookbook, variants, isAr, offers],
  );
  return {
    lookbookIds,
    toggleLookbookProduct,
    setLookbookIds: setPicks,
    collection,
    collectionLimits: limits,
  };
}
