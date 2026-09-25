import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { shouldShowPrices } from "@/lib/storefront-mode";
import { ProductShareModal } from "@/components/storefront/ProductShareModal";
import { type StorefrontProductDetail as Product } from "@/lib/data/storefront";

/** Product name with share and wishlist, and the price with any original price and saving. */
export function ProductTitleAndPrice({
  currency,
  discountPercent,
  displayName,
  displayPrice,
  isWishlisted,
  lang,
  originalPrice,
  priceLabel,
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
  originalPrice: number;
  priceLabel: string;
  product: Product;
  settings: ReturnType<typeof useStorefront>["settings"];
  t: ReturnType<typeof useStorefront>["t"];
  toggleWishlist: ReturnType<typeof useStorefront>["toggleWishlist"];
}) {
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
            <Heart
              className={`h-5 w-5 ${isWishlisted(product.id) ? "fill-red-600 text-red-600" : ""}`}
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
            <span>{priceLabel}</span>
            {originalPrice > displayPrice && (
              <span className="text-base font-normal text-muted-foreground line-through">
                {formatPrice(originalPrice, currency, lang)}
              </span>
            )}
            {discountPercent > 0 && (
              <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs text-white">
                {t(`وفر ${discountPercent}%`, `Save ${discountPercent}%`)}
              </span>
            )}
          </>
        )}
      </div>
    </>
  );
}
