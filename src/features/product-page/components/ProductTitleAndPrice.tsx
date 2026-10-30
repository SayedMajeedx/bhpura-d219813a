import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { SoftText } from "@/components/motion/SoftText";
import { LikeHeart } from "@/components/motion/LikeHeart";
import { Button } from "@/components/ui/button";
import { shouldShowPrices } from "@/lib/storefront-mode";
import { ProductShareModal } from "@/components/storefront/ProductShareModal";
import { type StorefrontProductDetail as Product } from "@/lib/data/storefront";
import { ProductOffers } from "@/features/product-page/components/ProductOffers";
import { ApproxPrice } from "@/components/storefront/CurrencySwitcher";
import { useLiveOffers } from "@/hooks/use-live-offers";
import { offeredShownPrice } from "@/lib/offer-price";
import { SALE_BADGE_CLASS } from "@/lib/storefront-badges";
import { Truck } from "lucide-react";
import { productDeliveryLine } from "@/features/product-page/lib/delivery-line";

/**
 * Product name with share and wishlist, the price with any original price and saving, the
 * delivery time beside it (where the shopper decides), and the store's offers that reach it.
 */
export function ProductTitleAndPrice({
  currency,
  discountPercent,
  displayName,
  displayPrice,
  isWishlisted,
  lang,
  madeForShopper = false,
  originalPrice,
  priceLabel,
  priceRange,
  product,
  settings,
  t,
  toggleWishlist,
}: {
  currency: ReturnType<typeof useStorefront>["currency"];
  discountPercent: number;
  displayName: string;
  displayPrice: number;
  isWishlisted: ReturnType<typeof useStorefront>["isWishlisted"];
  lang: ReturnType<typeof useStorefront>["lang"];
  /** The shopper is having this piece made: the made-to-order delivery time is said. */
  madeForShopper?: boolean;
  originalPrice: number;
  priceLabel: string;
  /** The prices of the sizes still possible (the label shows a range when they differ). */
  priceRange?: { min: number; max: number };
  product: Product;
  settings: ReturnType<typeof useStorefront>["settings"];
  t: ReturnType<typeof useStorefront>["t"];
  toggleWishlist: ReturnType<typeof useStorefront>["toggleWishlist"];
}) {
  // The store's offers on the shown price only (src/lib/offer-price.ts): the cart keeps the
  // price, and checkout takes the offer off once.
  const offers = useLiveOffers();
  const offered = offeredShownPrice(offers, product, {
    price: displayPrice,
    was: originalPrice,
    min: priceRange?.min ?? displayPrice,
    max: priceRange?.max ?? displayPrice,
    isRange: Boolean(priceRange && priceRange.min !== priceRange.max),
  });
  const shownLabel = !offered
    ? priceLabel
    : priceRange && priceRange.min !== priceRange.max
      ? `${formatPrice(offered.min, currency, lang)} – ${formatPrice(offered.max, currency, lang)}`
      : formatPrice(offered.price, currency, lang);
  const shownWas = offered ? offered.was : originalPrice;
  const shownPrice = offered ? offered.price : displayPrice;
  const shownPercent = offered ? offered.percent : discountPercent;
  const delivery = productDeliveryLine({ settings, lang, madeForShopper });
  return (
    <>
      <div className="mb-1 flex items-start justify-between gap-3 sm:mb-2">
        <h1
          className="font-display text-2xl sm:text-3xl"
          style={{ color: "var(--sf-product-title, var(--sf-heading))" }}
        >
          {displayName}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <ProductShareModal
            isAr={lang === "ar"}
            productName={displayName}
            priceFormatted={priceLabel}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full h-11 w-11"
            onClick={() => toggleWishlist(product.id)}
            aria-label={t("المفضلة", "Wishlist")}
          >
            <LikeHeart
              liked={isWishlisted(product.id)}
              className="h-5 w-5"
              likedClassName="fill-red-600 text-red-600"
            />
          </Button>
        </div>
      </div>
      <div
        className="mb-3 flex flex-wrap items-center gap-3 text-xl font-semibold sm:mb-4 sm:text-2xl"
        style={{ color: "var(--sf-price, var(--sf-heading))" }}
      >
        {!shouldShowPrices(settings) ? (
          <span className="text-base font-normal text-muted-foreground">
            {t("تواصل معنا للسعر", "Contact us for price")}
          </span>
        ) : (
          <>
            {/* Another size's price blurs in where the last one was (text swap soft). */}
            <SoftText value={shownLabel} />
            {shownWas > shownPrice && (
              <span className="text-base font-normal text-muted-foreground line-through">
                {formatPrice(shownWas, currency, lang)}
              </span>
            )}
            {shownPercent > 0 && (
              <span className={`rounded-full px-3 py-1 text-xs ${SALE_BADGE_CLASS}`}>
                {t(`وفر ${shownPercent}%`, `Save ${shownPercent}%`)}
              </span>
            )}
          </>
        )}
        {delivery && (
          <span className="ms-auto inline-flex max-w-full items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-foreground">
            <Truck className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
            <span className="min-w-0 break-words">{delivery}</span>
          </span>
        )}
        {shouldShowPrices(settings) && (
          <ApproxPrice amount={shownPrice} className="basis-full text-sm" />
        )}
      </div>
      <ProductOffers product={product} />
    </>
  );
}
