import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { offersQueries, type OffersPreviewArgs } from "@/lib/data/offers";
import type { OffersOutcome } from "@/lib/offers";
import type { AppliedPromo, Storefront } from "@/features/checkout/types";

/**
 * What the store's automatic offers give this cart, as the order builder will give it
 * (`storefront_offers_preview` runs the builder's own rule on the cart's lines): the offer's
 * discount, the code's (none when an offer beat it), and free delivery. Not asked for a booking
 * (its own offers apply) or a catalog store (no checkout); null until the store answers.
 */
export function useCheckoutOffers({
  brand,
  cart,
  appliedPromo,
  fulfillment,
  country,
  enabled,
}: {
  brand: Pick<Storefront["brand"], "slug">;
  cart: Storefront["cart"];
  appliedPromo: AppliedPromo | null;
  fulfillment: string;
  country: string | null;
  enabled: boolean;
}): OffersOutcome | null {
  const args = useMemo<OffersPreviewArgs>(
    () => ({
      items: cart
        .filter((item) => item.variant_id && item.variant_id.trim())
        .map((item) => ({
          variant_id: item.variant_id as string,
          quantity: item.qty,
          line_total: Number((item.price * item.qty).toFixed(3)),
        })),
      promoCode: appliedPromo?.code ?? null,
      fulfillment,
      country: fulfillment === "delivery" ? country : null,
    }),
    [cart, appliedPromo?.code, fulfillment, country],
  );
  // Only a store with live offers is asked about a cart.
  const live = useQuery(offersQueries.live(brand.slug, enabled)).data ?? [];
  const preview = useQuery(offersQueries.preview(brand.slug, args, enabled && live.length > 0));
  if (!enabled || live.length === 0) return null;
  return preview.data ?? null;
}
