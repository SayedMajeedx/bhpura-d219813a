import React from "react";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { ResponsiveImage } from "@/components/responsive-media";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { type ProductRow } from "@/routes/$slug.index";
import { Button } from "@/components/ui/button";

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
  const displayName = pickName(lang, product);
  const pricedVariants = product.product_variants
    .filter((variant) => Number(variant.selling_price || 0) >= 0)
    .sort((a, b) => a.selling_price - b.selling_price);
  const discountedVariant = pricedVariants.filter(
    (variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0),
  )[0];
  const displayVariant = discountedVariant ?? pricedVariants[0];
  const variantPrices = pricedVariants.map((v) => Number(v.selling_price || 0));
  const minPrice =
    variantPrices.length > 0
      ? Math.min(...variantPrices)
      : Number(displayVariant?.selling_price || 0);
  const maxPrice =
    variantPrices.length > 0
      ? Math.max(...variantPrices)
      : Number(displayVariant?.selling_price || 0);
  const originalPrice = discountedVariant ? Number(discountedVariant.original_price) : 0;
  const discountPercent = discountedVariant
    ? Math.round((1 - discountedVariant.selling_price / originalPrice) * 100)
    : 0;
  const totalStock = product.product_variants.reduce(
    (s, v) => s + (Number(v.stock_main || 0) + Number(v.stock_incubator || 0)),
    0,
  );
  const oos = totalStock <= 0;

  const media = Array.isArray(product.media)
    ? (product.media as Array<{ type: string; url: string }>)
    : [];
  const cover = media.find((m) => m.type === "image")?.url || product.image_url;

  const wished = isWishlisted(product.id);
  const isAr = lang === "ar";

  // Muted, high-end editorial overlay badges configuration
  let badgeStyle = "";
  let badgeLabel = "";

  if (
    discountPercent > 0 &&
    settings.global_sale_badges_enabled &&
    product.show_sale_badge !== false
  ) {
    badgeStyle = "bg-primary text-primary-foreground border-primary";
    badgeLabel = isAr ? `وفر ${discountPercent}%` : `Sale ${discountPercent}% off`;
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
    <div className={`group relative ${staggerClass} ${className || "w-full"}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => toggleWishlist(product.id)}
        aria-label={
          wished
            ? t("إزالة من المفضلة", "Remove from wishlist")
            : t("إضافة إلى المفضلة", "Add to wishlist")
        }
        className="absolute end-2.5 top-2.5 z-20 h-11 w-11 rounded-full bg-background/95 text-foreground shadow-sm border border-border transition-[transform,colors] duration-200 hover:scale-110 active:scale-90 hover:bg-background hover:text-destructive"
      >
        <Heart
          className={`h-4 w-4 transition-colors duration-200 ${wished ? "fill-destructive text-destructive" : ""}`}
        />
      </Button>

      <Link
        to="/$slug/product/$id"
        params={{ slug: brand.slug, id: product.id }}
        preload="intent"
        className="block transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 sm:hover:-translate-y-1.5"
        onClick={() => {
          void (supabase.rpc as any)("record_storefront_product_engagement", {
            p_brand_slug: brand.slug,
            p_product_id: product.id,
            p_event: "click",
          });
        }}
      >
        <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted relative">
          {badgeLabel && (
            <span
              className={`absolute start-2.5 top-2.5 z-10 rounded-md border px-2.5 py-1 text-[10px] font-medium shadow-sm select-none ${badgeStyle} ${
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
            <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">
              {t("لا توجد صورة", "No image")}
            </div>
          )}

          {oos && (
            <div className="absolute inset-0 bg-black/40 grid place-items-center">
              <span className="bg-white/95 px-3 py-1 rounded-full text-xs font-semibold text-neutral-900">
                {t("نفد المخزون", "Sold out")}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 text-start">
          <div
            className="product-title text-sm font-medium truncate"
            style={{ color: "var(--sf-heading)" }}
          >
            {displayName}
          </div>
          <div
            className="price-tag flex flex-wrap items-baseline gap-2 text-sm font-semibold mt-0.5"
            style={{ color: "var(--sf-heading)" }}
          >
            {minPrice > 0 ? (
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
                  {formatPrice(minPrice, currency, lang)} – {formatPrice(maxPrice, currency, lang)}
                </span>
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
