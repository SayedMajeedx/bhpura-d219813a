import { useQuery } from "@tanstack/react-query";
import { Gift, Percent, Truck } from "lucide-react";
import { offersQueries } from "@/lib/data/offers";
import { offerEnds, offersForProduct, offerTerms, type StoreOffer } from "@/lib/offers";
import { productOnSale } from "@/lib/product-price";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";
import type { StorefrontProductDetail as Product } from "@/lib/data/storefront";

const ICONS: Record<StoreOffer["kind"], typeof Percent> = {
  discount: Percent,
  buy_x_get_y: Gift,
  free_delivery: Truck,
};

/**
 * The store's live offers that reach this product, under its price: "10% off on orders of
 * 40.000 BHD or more", "Buy 2, get 1 free", "Free local delivery…". Said only by a shop that
 * shows its prices, and never on a service (a booking gets its own offers, not these); what an
 * order gets is worked out at checkout by the database.
 */
export function ProductOffers({ product }: { product: Product }) {
  const { brand, settings, lang, currency } = useStorefront();
  const sells =
    !isCatalogMode(settings) && shouldShowPrices(settings) && product.item_kind !== "service";
  const offers = useQuery(offersQueries.live(brand.slug, sells)).data ?? [];
  if (!sells || offers.length === 0) return null;
  const reaching = offersForProduct(offers, {
    id: product.id,
    category: product.category ?? null,
    onSale: productOnSale(product),
  });
  if (reaching.length === 0) return null;
  const money = (n: number) => formatPrice(n, currency, lang);

  return (
    <ul className="mb-4 space-y-1.5" aria-label={lang === "ar" ? "عروض المتجر" : "Store offers"}>
      {reaching.map((offer) => {
        const Icon = ICONS[offer.kind];
        const ends = offerEnds(offer, lang);
        return (
          <li
            key={offer.id}
            className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: settings.primary_color }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="font-medium">{offerTerms(offer, lang, money)}</span>
              {ends && <span className="text-muted-foreground"> · {ends}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
