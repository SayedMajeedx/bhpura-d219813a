import React, { useState } from "react";
import { CardFactLine } from "@/components/storefront/CardFactLine";
import { ProductPhotoPlaceholder } from "@/components/storefront/ProductPhotoPlaceholder";
import { productCover } from "@/lib/product-photo";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ResponsiveImage } from "@/components/responsive-media";
import { ColorDots } from "@/components/storefront/ColorDots";
import { QuickAddPopover } from "@/components/storefront/QuickAddPopover";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { ApproxPrice } from "@/components/storefront/CurrencySwitcher";
import { PRODUCT_PHOTO_CLASS, productCardRatio } from "@/lib/brand-templates/design-presets";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { Eye } from "lucide-react";
import { LikeHeart } from "@/components/motion/LikeHeart";
import { QuickViewModal } from "@/components/storefront/QuickViewModal";
import { useReveal } from "@/lib/motion/use-reveal";
import { nameTappedPhoto } from "@/lib/motion/view-transition";
import { serviceLengthsText } from "@/lib/bookings/service-lengths";
import { hasAvailableStock } from "@/lib/data/storefront";
import { useLiveOffers } from "@/hooks/use-live-offers";
import { offeredCardPrice } from "@/lib/offer-price";
import { SALE_BADGE_CLASS } from "@/lib/storefront-badges";

export interface ProductCardV2Props {
  product: any;
  index?: number;
  badge?: "best" | "sale" | "trending";
  className?: string;
  onOpenQuickView?: () => void;
}

export function ProductCardV2({
  product,
  index,
  badge,
  className,
  onOpenQuickView,
}: ProductCardV2Props) {
  const { brand, settings, currency, lang, t, wishlist, toggleWishlist } = useStorefront();
  const isAr = lang === "ar";
  const wished = wishlist.includes(product.id);

  // Quick View state
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  // Quick view is an add-to-cart surface (price, quantity, cart CTA), so it is
  // suppressed on catalog / inquiry-only storefronts. The card still links to
  // the product page, which has the inquiry flow.
  const showQuickView = settings?.quick_view_enabled !== false && !isCatalogMode(settings);
  const handleTriggerQuickView = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (onOpenQuickView) {
      onOpenQuickView();
    } else {
      setQuickViewOpen(true);
    }
  };

  // Zero-CLS scroll reveal
  const { ref: revealRef } = useReveal<HTMLDivElement>({
    disabled: settings?.motion_enabled === false,
  });

  // Hover image swap state (loaded on first hover/focus)
  const [isHovered, setIsHovered] = useState(false);
  const [hasHoveredOnce, setHasHoveredOnce] = useState(false);

  // Variants & Pricing
  const variants: any[] = Array.isArray(product.product_variants) ? product.product_variants : [];

  // Extract media items
  const mediaList: Array<{ type: string; url: string }> = Array.isArray(product.media)
    ? product.media.filter((m: any) => m && m.url)
    : [];
  const primaryImage = productCover(product);
  const secondaryImage =
    mediaList.length > 1
      ? mediaList.find((m, i) => i > 0 && (m.type === "image" || !m.type))?.url || null
      : variants.find((v) => v.image_url && v.image_url !== primaryImage)?.image_url || null;
  // What a shopper can buy now, its own discount and the store's offers (one rule:
  // src/lib/offer-price.ts over src/lib/product-price.ts).
  const offers = useLiveOffers();
  const price = offeredCardPrice(product, variants, offers);
  const minPrice = price.from;
  const maxPrice = price.to;

  // Stock
  const hasVariants = variants.length > 0;
  // Made-to-order items and services have no stock to run out of (one rule
  // for the whole storefront: hasAvailableStock).
  const isOos = hasVariants && !hasAvailableStock(product);
  // A service shows how long it can be booked for.
  const lengths =
    product.item_kind === "service"
      ? [
          product.is_package ? (lang === "ar" ? "باقة" : "Package") : null,
          serviceLengthsText(variants, lang === "ar"),
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  // Badge determination (Priority: Sale > New > Best Seller > Trending)
  const newBadgeDays = Number(settings?.new_badge_days ?? 14);
  const isNewProduct = (() => {
    if (!product.created_at || newBadgeDays <= 0) return false;
    const createdDate = new Date(product.created_at).getTime();
    const diffDays = (Date.now() - createdDate) / (1000 * 60 * 60 * 24);
    return diffDays <= newBadgeDays;
  })();

  let badgeLabel: string | null = null;
  let badgeStyle = "bg-primary text-primary-foreground border-transparent";

  // The store's and the product's sale badge switches (as on the classic card).
  const saleBadge =
    price.onSale &&
    settings?.global_sale_badges_enabled !== false &&
    product.show_sale_badge !== false;

  if (shouldShowPrices(settings) && price.offerBadge?.kind === "discount") {
    // A store offer lowers the price: its percentage, struck price beside the new one.
    badgeLabel = `-${price.offerBadge.percent}%`;
    badgeStyle = `${SALE_BADGE_CLASS} border-transparent`;
  } else if (saleBadge) {
    badgeLabel = price.percent ? `-${price.percent}%` : t("تخفيض", "Sale");
    badgeStyle = `${SALE_BADGE_CLASS} border-transparent`;
  } else if (shouldShowPrices(settings) && price.offerBadge?.kind === "offer") {
    // An offer with terms (a minimum, buy X get Y): its terms are on the product's page.
    badgeLabel = t("عرض", "Offer");
    badgeStyle = `${SALE_BADGE_CLASS} border-transparent`;
  } else if (isNewProduct) {
    badgeLabel = t("جديد", "New");
    badgeStyle = "bg-primary text-primary-foreground border-transparent";
  } else if (badge === "best") {
    badgeLabel = t("الأكثر طلباً", "Best Seller");
    badgeStyle = "bg-background/95 text-foreground border-border";
  } else if (badge === "trending") {
    badgeLabel = t("رائج", "Trending");
    badgeStyle = "bg-background/95 text-foreground border-border";
  }

  const displayName = isAr
    ? product.name_ar || product.name_en || product.name
    : product.name_en || product.name_ar || product.name;

  // One entrance: the scroll reveal, staggered along a row (it once also ran a mount
  // animation, so a card below the fold faded in unseen, vanished and faded in again).
  const staggerClass = typeof index === "number" ? `sf-stagger-${(index % 8) + 1}` : "";

  const handlePointerEnter = () => {
    setIsHovered(true);
    if (!hasHoveredOnce) {
      setHasHoveredOnce(true);
    }
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
  };

  const allowHoverImage = settings?.product_card_hover_image !== false;
  const activeImage =
    isHovered && allowHoverImage && secondaryImage && hasHoveredOnce
      ? secondaryImage
      : primaryImage;

  return (
    <div
      ref={revealRef}
      data-product-id={product.id}
      className={`group relative flex flex-col sf-reveal sf-cv-card ${staggerClass} ${className || "w-full"}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Quick View Button (Desktop) */}
      {showQuickView && (
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          onClick={handleTriggerQuickView}
          aria-label={t("معاينة سريعة", "Quick view")}
          className="absolute end-12 top-2.5 z-20 hidden md:inline-flex rounded-full bg-background/90 text-foreground shadow-xs border border-border backdrop-blur-xs transition-[transform,colors] duration-200 hover:scale-110 active:scale-95 hover:bg-background hover:text-primary"
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}

      {/* Wishlist Button */}
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
        className="absolute end-2.5 top-2.5 z-20 rounded-full bg-background/90 text-foreground shadow-xs border border-border backdrop-blur-xs transition-[transform,colors] duration-200 hover:scale-110 active:scale-95 hover:bg-background hover:text-destructive"
      >
        <LikeHeart liked={wished} className="h-4 w-4" />
      </Button>

      <Link
        to="/$slug/product/$id"
        params={{ slug: brand.slug, id: product.id }}
        preload="intent"
        viewTransition
        className="flex flex-1 flex-col transition-transform duration-250 ease-(--motion-ease-smooth) hover:-translate-y-1 sm:hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        onClick={(event) => {
          nameTappedPhoto(event.currentTarget, product.id);
          void trackProductEngagement(brand.slug, product.id, "click");
        }}
      >
        {/* Card Media Container */}
        <div
          className={`${PRODUCT_PHOTO_CLASS[productCardRatio(settings)]} rounded-xl overflow-hidden bg-muted relative border border-border shadow-xs group-hover:shadow-md transition-shadow duration-300`}
        >
          {/* Badge */}
          {badgeLabel && (
            <span
              className={`absolute start-2.5 top-2.5 z-10 rounded-md px-2.5 py-0.5 text-xs font-semibold shadow-xs select-none ${badgeStyle} ${
                isAr ? "font-display leading-none" : "tracking-wider uppercase"
              }`}
            >
              {badgeLabel}
            </span>
          )}

          {/* Primary / Secondary Image */}
          {activeImage ? (
            <ResponsiveImage
              src={activeImage}
              preset="card"
              sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              alt={displayName}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              loading="lazy"
              decoding="async"
              quality={78}
            />
          ) : (
            <ProductPhotoPlaceholder />
          )}

          {/* Out of Stock Overlay */}
          {isOos && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] grid place-items-center p-3 text-center z-10">
              <span className="bg-background/95 border border-border px-3 py-1.5 rounded-full text-xs font-semibold text-foreground shadow-sm">
                {settings?.back_in_stock_enabled !== false
                  ? t("نفد — نبّهني عند التوفر", "Sold out — Notify me")
                  : t("نفد من المخزون", "Out of stock")}
              </span>
            </div>
          )}

          {/* Desktop Quick Add Popover Overlay on Hover */}
          {!isOos && settings?.product_card_quick_add !== false && (
            <div className="absolute bottom-2 inset-x-2 z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
              <QuickAddPopover
                product={product}
                variants={variants}
                onOpenQuickView={handleTriggerQuickView}
              />
            </div>
          )}
        </div>

        {/* Product Details Info: the price sits at the card's foot (`mt-auto`), so a row's
            prices line up however many lines its names take, with no empty line kept under a
            short name. */}
        <div className="mt-2.5 flex flex-1 flex-col gap-1 text-start">
          {/* Color Dots */}
          {settings?.product_card_color_dots !== false && (
            <ColorDots variants={variants} product={product} maxVisible={4} />
          )}

          {/* Product Title */}
          <h3
            // At most two lines. Each line must hold Arabic marks below the baseline: a tight line-height cuts them off.
            dir="auto"
            className="product-title text-sm font-medium leading-[1.8] line-clamp-2 break-words text-page-start transition-colors duration-200 group-hover:text-primary"
            style={{ color: "var(--sf-product-title, var(--sf-heading))" }}
          >
            {displayName}
          </h3>
          <CardFactLine details={product.details} reserve={false} />

          {/* Price Tag */}
          <div
            className="price-tag mt-auto flex flex-wrap items-baseline gap-2 text-sm font-semibold"
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
                  {price.was && (
                    <span className="text-xs font-normal text-muted-foreground line-through">
                      {formatPrice(price.was, currency, lang)}
                    </span>
                  )}
                  <ApproxPrice amount={minPrice} className="basis-full" />
                </>
              ) : (
                <>
                  <span>
                    {t("من", "From")} {formatPrice(minPrice, currency, lang)}
                  </span>
                  {price.was && (
                    <span className="text-xs font-normal text-muted-foreground line-through">
                      {formatPrice(price.was, currency, lang)}
                    </span>
                  )}
                  <ApproxPrice amount={minPrice} className="basis-full" />
                </>
              )
            ) : (
              <span>{t("السعر عند الطلب", "Price on request")}</span>
            )}
          </div>
          {lengths && <p className="mt-0.5 text-xs text-muted-foreground">{lengths}</p>}
        </div>
      </Link>

      {/* Quick View Modal */}
      {showQuickView && (
        <QuickViewModal
          open={quickViewOpen}
          onOpenChange={setQuickViewOpen}
          product={product}
          brandSlug={brand.slug}
        />
      )}
    </div>
  );
}
