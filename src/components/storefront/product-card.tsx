import { Link } from "@tanstack/react-router";
import { CardFactLine } from "@/components/storefront/CardFactLine";
import { ProductPhotoPlaceholder } from "@/components/storefront/ProductPhotoPlaceholder";
import { LikeHeart } from "@/components/motion/LikeHeart";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { PRODUCT_PHOTO_CLASS, productCardRatio } from "@/lib/brand-templates/design-presets";
import { shouldShowPrices } from "@/lib/storefront-mode";
import { ResponsiveImage } from "@/components/responsive-media";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { hasAvailableStock, type ProductRow } from "@/lib/data/storefront";
import { Button } from "@/components/ui/button";

import { ProductCardV2 } from "@/components/storefront/ProductCardV2";
import { ApproxPrice } from "@/components/storefront/CurrencySwitcher";
import { useLiveOffers } from "@/hooks/use-live-offers";
import { offeredCardPrice } from "@/lib/offer-price";
import { nameTappedPhoto } from "@/lib/motion/view-transition";

export function ProductCard({
  product,
  badge,
  index,
  className,
}: {
  product: ProductRow;
  badge?: "trending" | "best";
  index?: number;
  className?: string;
}) {
  const { brand, currency, lang, t, isWishlisted, toggleWishlist, settings } = useStorefront();
  // The store's live offers, before any early return (one request shared by every card).
  const offers = useLiveOffers();

  if (settings?.storefront_design_version === 2) {
    return <ProductCardV2 product={product} badge={badge} index={index} className={className} />;
  }

  const displayName = pickName(lang, product);
  const pricedVariants = product.product_variants
    .filter((variant) => Number(variant.selling_price || 0) >= 0)
    .sort((a, b) => a.selling_price - b.selling_price);
  // What a shopper can buy now, its own discount and the store's offers (one rule:
  // src/lib/offer-price.ts over src/lib/product-price.ts).
  const price = offeredCardPrice(product, product.product_variants, offers);
  const minPrice = price.from;
  const maxPrice = price.to;
  const originalPrice = price.was ?? 0;
  // One rule for the whole storefront: made-to-order items and services never run out.
  const oos = !hasAvailableStock(product);

  const media = Array.isArray(product.media)
    ? (product.media as Array<{ type: string; url: string }>)
    : [];
  const cover =
    media.find((m) => m.type === "image")?.url ||
    product.image_url ||
    pricedVariants.find((v) => v.image_url)?.image_url ||
    product.product_variants.find((v) => v.image_url)?.image_url ||
    null;

  const wished = isWishlisted(product.id);
  const isAr = lang === "ar";

  // Muted, high-end editorial overlay badges configuration
  let badgeStyle = "";
  let badgeLabel = "";

  if (shouldShowPrices(settings) && price.offerBadge?.kind === "discount") {
    // A store offer lowers the price: its percentage, struck price beside the new one.
    badgeStyle = "bg-primary text-primary-foreground border-primary";
    badgeLabel = isAr ? `وفر ${price.offerBadge.percent}%` : `${price.offerBadge.percent}% off`;
  } else if (
    shouldShowPrices(settings) &&
    price.onSale &&
    settings.global_sale_badges_enabled &&
    product.show_sale_badge !== false
  ) {
    badgeStyle = "bg-primary text-primary-foreground border-primary";
    badgeLabel = price.percent
      ? isAr
        ? `وفر ${price.percent}%`
        : `Sale ${price.percent}% off`
      : isAr
        ? "تخفيض"
        : "Sale";
  } else if (shouldShowPrices(settings) && price.offerBadge?.kind === "offer") {
    // An offer with terms (a minimum, buy X get Y): its terms are on the product's page.
    badgeStyle = "bg-primary text-primary-foreground border-primary";
    badgeLabel = isAr ? "عرض" : "Offer";
  } else if (badge === "best") {
    badgeStyle = "bg-secondary text-secondary-foreground border-border";
    badgeLabel = isAr ? "الأكثر مبيعاً" : "Best Seller";
  } else if (badge === "trending") {
    badgeStyle = "bg-muted text-muted-foreground border-border";
    badgeLabel = isAr ? "رائج" : "Trending";
  }

  const staggerClass =
    typeof index === "number"
      ? `storefront-fade-in-up stagger-${(index % 8) + 1}`
      : "storefront-fade-in-up";

  return (
    <div
      data-product-id={product.id}
      className={`group relative flex flex-col sf-cv-card ${staggerClass} ${className || "w-full"}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        onClick={() => toggleWishlist(product.id)}
        aria-label={
          wished
            ? t("إزالة من المفضلة", "Remove from wishlist")
            : t("إضافة إلى المفضلة", "Add to wishlist")
        }
        className="absolute end-2.5 top-2.5 z-20 rounded-full bg-background/95 text-foreground shadow-sm border border-border transition-[transform,colors] duration-200 hover:scale-110 active:scale-90 hover:bg-background hover:text-destructive"
      >
        <LikeHeart liked={wished} className="h-4 w-4" />
      </Button>

      <Link
        to="/$slug/product/$id"
        params={{ slug: brand.slug, id: product.id }}
        preload="intent"
        viewTransition
        className="flex flex-1 flex-col transition-transform duration-250 ease-(--motion-ease-smooth) hover:-translate-y-1 sm:hover:-translate-y-1.5"
        onClick={(event) => {
          nameTappedPhoto(event.currentTarget, product.id);
          void trackProductEngagement(brand.slug, product.id, "click");
        }}
      >
        <div
          className={`${PRODUCT_PHOTO_CLASS[productCardRatio(settings)]} rounded-xl overflow-hidden bg-muted relative`}
        >
          {badgeLabel && (
            <span
              className={`absolute start-2.5 top-2.5 z-10 rounded-md border px-2.5 py-1 text-xs font-medium shadow-sm select-none ${badgeStyle} ${
                isAr ? "font-display leading-none" : "tracking-widest uppercase"
              }`}
            >
              {badgeLabel}
            </span>
          )}

          {cover ? (
            <ResponsiveImage
              src={cover}
              preset="card"
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              // [TECH ADVISOR #1]: Real informational product photos MUST have dynamic/descriptive alt text
              alt={displayName}
              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              loading="lazy"
              decoding="async"
              quality={76}
            />
          ) : (
            <ProductPhotoPlaceholder />
          )}

          {oos && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] grid place-items-center">
              <span className="bg-background/95 border border-border px-3 py-1 rounded-full text-xs font-semibold text-foreground shadow-sm">
                {t("نفد المخزون", "Sold out")}
              </span>
            </div>
          )}
        </div>

        {/* The price sits at the card's foot, so a row's prices line up without an empty line. */}
        <div className="mt-2 flex flex-1 flex-col text-start">
          <div
            dir="auto"
            className="product-title text-sm font-medium leading-[1.8] line-clamp-2 break-words text-page-start"
            style={{ color: "var(--sf-product-title, var(--sf-heading))" }}
          >
            {displayName}
          </div>
          <CardFactLine details={product.details} reserve={false} />
          <div
            className="price-tag mt-auto flex flex-wrap items-baseline gap-2 pt-0.5 text-sm font-semibold"
            style={{ color: "var(--sf-price, var(--sf-heading))" }}
          >
            {!shouldShowPrices(settings) ? (
              <span className="text-xs font-normal text-muted-foreground">
                {t("تواصل معنا للسعر", "Contact us for price")}
              </span>
            ) : minPrice > 0 ? (
              minPrice === maxPrice ? (
                <>
                  <span>{formatPrice(minPrice, currency, lang)}</span>
                  {originalPrice > minPrice && (
                    <span className="text-xs font-normal text-muted-foreground line-through">
                      {formatPrice(originalPrice, currency, lang)}
                    </span>
                  )}
                  <ApproxPrice amount={minPrice} className="basis-full" />
                </>
              ) : (
                <>
                  <span>
                    {formatPrice(minPrice, currency, lang)} –{" "}
                    {formatPrice(maxPrice, currency, lang)}
                  </span>
                  <ApproxPrice amount={minPrice} className="basis-full" />
                </>
              )
            ) : (
              <span>{t("السعر عند الطلب", "Price on request")}</span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
