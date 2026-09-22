import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ResponsiveImage } from "@/components/responsive-media";
import { ColorDots } from "@/components/storefront/ColorDots";
import { QuickAddPopover } from "@/components/storefront/QuickAddPopover";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { Heart, Eye } from "lucide-react";
import { QuickViewModal } from "@/components/storefront/QuickViewModal";
import { useReveal } from "@/lib/motion/use-reveal";

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
  const variantWithImage = variants.find((v) => v.image_url)?.image_url || null;
  const primaryImage =
    product.image_url ||
    mediaList.find((m) => m.type === "image" || !m.type)?.url ||
    variantWithImage ||
    null;
  const secondaryImage =
    mediaList.length > 1
      ? mediaList.find((m, i) => i > 0 && (m.type === "image" || !m.type))?.url || null
      : variants.find((v) => v.image_url && v.image_url !== primaryImage)?.image_url || null;
  const prices = variants
    .map((v) => Number(v.selling_price ?? v.price ?? product.base_price ?? 0))
    .filter((p) => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : Number(product.base_price ?? 0);
  const maxPrice = prices.length > 0 ? Math.max(...prices) : Number(product.base_price ?? 0);
  const originalPrice = Number(product.original_price ?? 0);

  // Stock
  const totalStock = variants.reduce(
    (sum, v) => sum + Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0),
    0,
  );
  const hasVariants = variants.length > 0;
  const isOos = hasVariants && totalStock <= 0;

  // Badge determination (Priority: Sale > New > Best Seller > Trending)
  const newBadgeDays = Number(settings?.new_badge_days ?? 14);
  const isNewProduct = (() => {
    if (!product.created_at || newBadgeDays <= 0) return false;
    const createdDate = new Date(product.created_at).getTime();
    const diffDays = (Date.now() - createdDate) / (1000 * 60 * 60 * 24);
    return diffDays <= newBadgeDays;
  })();

  const isSale = originalPrice > minPrice;

  let badgeLabel: string | null = null;
  let badgeStyle = "bg-primary text-primary-foreground border-transparent";

  if (isSale) {
    const discountPct = Math.round(((originalPrice - minPrice) / originalPrice) * 100);
    badgeLabel = discountPct > 0 ? `-${discountPct}%` : t("تخفيض", "Sale");
    badgeStyle = "bg-destructive text-destructive-foreground border-transparent";
  } else if (isNewProduct) {
    badgeLabel = t("جديد", "New");
    badgeStyle = "bg-primary text-primary-foreground border-transparent";
  } else if (badge === "best") {
    badgeLabel = t("الأكثر طلباً", "Best Seller");
    badgeStyle = "bg-warning text-white border-transparent";
  } else if (badge === "trending") {
    badgeLabel = t("رائج", "Trending");
    badgeStyle = "bg-violet-600 text-white border-transparent";
  }

  const displayName = isAr
    ? product.name_ar || product.name_en || product.name
    : product.name_en || product.name_ar || product.name;

  const staggerClass =
    typeof index === "number"
      ? `storefront-fade-in-up stagger-${(index % 8) + 1}`
      : "storefront-fade-in-up";

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
      className={`group relative sf-reveal sf-cv-card ${staggerClass} ${className || "w-full"}`}
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
        <Heart
          className={`h-4 w-4 transition-colors duration-200 ${
            wished ? "fill-destructive text-destructive" : ""
          }`}
        />
      </Button>

      <Link
        to="/$slug/product/$id"
        params={{ slug: brand.slug, id: product.id }}
        preload="intent"
        className="block transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 sm:hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        onClick={() => {
          void trackProductEngagement(brand.slug, product.id, "click");
        }}
      >
        {/* Card Media Container */}
        <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted relative border border-border shadow-xs group-hover:shadow-md transition-shadow duration-300">
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
            <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">
              {t("لا توجد صورة", "No image")}
            </div>
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
            <div className="absolute bottom-2 inset-x-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              <QuickAddPopover
                product={product}
                variants={variants}
                onOpenQuickView={handleTriggerQuickView}
              />
            </div>
          )}
        </div>

        {/* Product Details Info */}
        <div className="mt-2.5 text-start space-y-1">
          {/* Color Dots */}
          {settings?.product_card_color_dots !== false && (
            <ColorDots variants={variants} maxVisible={4} />
          )}

          {/* Product Title */}
          <h3
            className="product-title text-sm font-medium line-clamp-1 transition-colors duration-200 group-hover:text-primary"
            style={{ color: "var(--sf-product-title, var(--sf-heading))" }}
          >
            {displayName}
          </h3>

          {/* Price Tag */}
          <div
            className="price-tag flex flex-wrap items-baseline gap-2 text-sm font-semibold"
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
                </>
              ) : (
                <span>
                  {t("من", "From")} {formatPrice(minPrice, currency, lang)}
                </span>
              )
            ) : (
              <span>{t("السعر عند الطلب", "Price on request")}</span>
            )}
          </div>
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
