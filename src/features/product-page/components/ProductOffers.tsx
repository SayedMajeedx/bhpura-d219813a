import { useQuery } from "@tanstack/react-query";
import { Gift, Percent, Truck } from "lucide-react";
import { offersQueries } from "@/lib/data/offers";
import {
  offerCountdown,
  offerForOtherPieces,
  offerLimitNote,
  offersForProduct,
  offerWording,
  type StoreOffer,
} from "@/lib/offers";
import { cn } from "@/lib/utils";
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
 * 40.000 BHD or more", "Buy 2, get 1 free", "Free local delivery…", with when it ends. Said only
 * by a shop that shows its prices, on a product and on a service (a booking takes the better of
 * these and its booking offers, apply_booking_discount); what an order gets is worked out by the
 * database.
 *
 * An offer for the other kind of piece than the one being chosen (an offer on ready pieces while
 * the shopper has tailoring chosen) stays, dimmed, with what it is for and, where the product has
 * a ready size, a way to choose one: shown as if it applied, it promised a discount the order
 * would not get (the owner's decision of 2026-11-14).
 */
export function ProductOffers({
  product,
  madeToOrder,
  onChooseReady,
}: {
  product: Product;
  /** The shopper is having the piece made (unknown: every offer reads as it applies). */
  madeToOrder?: boolean;
  /** Switches to a ready size (absent: the product has none to switch to). */
  onChooseReady?: () => void;
}) {
  const { brand, settings, lang, currency } = useStorefront();
  const sells = !isCatalogMode(settings) && shouldShowPrices(settings);
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
        const ends = offerCountdown(offer, lang);
        const other = offerForOtherPieces(offer, madeToOrder);
        const limit = offerLimitNote(offer, lang);
        const switchable = other && offer.pieces === "ready" && onChooseReady;
        return (
          <li
            key={offer.id}
            data-applies={other ? "false" : "true"}
            className={cn(
              "flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm",
              other && "border-dashed bg-muted/40",
            )}
          >
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: settings.primary_color }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className={cn("font-medium", other && "text-muted-foreground")}>
                {offerWording(offer, lang, money)}
              </span>
              {limit && !other && <span className="text-muted-foreground"> · {limit}</span>}
              {ends && <span className="text-muted-foreground"> · {ends}</span>}
              {other && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {offer.pieces === "ready"
                    ? lang === "ar"
                      ? "على المقاسات الجاهزة فقط، لا يشمل التفصيل حسب الطلب."
                      : "On ready sizes only, not on a piece made to order."
                    : lang === "ar"
                      ? "على التفصيل حسب الطلب فقط."
                      : "On made-to-order pieces only."}
                  {switchable && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={onChooseReady}
                        className="font-medium text-foreground underline underline-offset-2"
                      >
                        {lang === "ar" ? "اختر مقاسًا جاهزًا" : "Choose a ready size"}
                      </button>
                    </>
                  )}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
