import { Link } from "@tanstack/react-router";
import { railPhoneAlign } from "@/lib/rail-layout";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { shouldShowPrices } from "@/lib/storefront-mode";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { ResponsiveImage } from "@/components/responsive-media";
import { type RecommendationProduct } from "@/lib/data/storefront";
import { cardPrice } from "@/lib/product-price";
import { PRODUCT_PHOTO_CLASS, productCardRatio } from "@/lib/brand-templates/design-presets";
import { ProductPhotoPlaceholder } from "@/components/storefront/ProductPhotoPlaceholder";

export function RecommendationRail({
  title,
  products,
}: {
  title: string;
  products: RecommendationProduct[];
}) {
  const { brand, currency, lang, t, settings } = useStorefront();
  // The store's own photo shape, as its cards (a bakery's square, not a portrait).
  const photoClass = PRODUCT_PHOTO_CLASS[productCardRatio(settings)];

  return (
    <section aria-label={title} className="w-full overflow-x-clip">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl sm:text-2xl">{title}</h2>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {t("اسحب للمزيد", "Scroll for more")}
        </span>
      </div>
      <div
        className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:gap-4 sm:px-0 [scrollbar-width:thin] ${railPhoneAlign(products.length)}`}
      >
        {products.map((item) => {
          // What a shopper can buy now, and its own discount (src/lib/product-price.ts).
          const price = cardPrice(item, item.product_variants);
          const media = Array.isArray(item.media)
            ? (item.media as Array<{ type: string; url: string }>)
            : [];
          const cover = media.find((entry) => entry.type === "image")?.url || item.image_url;
          const name = pickName(lang, item);

          return (
            <Link
              key={item.id}
              to="/$slug/product/$id"
              params={{ slug: brand.slug, id: item.id }}
              className="group w-[8.75rem] shrink-0 snap-start sm:w-[10.5rem]"
              onClick={() => {
                void trackProductEngagement(brand.slug, item.id, "click");
              }}
            >
              <div className={`${photoClass} overflow-hidden rounded-xl bg-muted`}>
                {cover ? (
                  <ResponsiveImage
                    src={cover}
                    preset="thumb"
                    sizes="(min-width: 640px) 168px, 140px"
                    alt={name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <ProductPhotoPlaceholder />
                )}
              </div>
              <div className="mt-2 min-w-0">
                <div className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{name}</div>
                {price.from > 0 && (
                  <div
                    className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold"
                    style={{ color: "var(--sf-heading)" }}
                  >
                    {!shouldShowPrices(settings) ? (
                      <span className="font-normal text-muted-foreground">
                        {t("تواصل معنا للسعر", "Contact us for price")}
                      </span>
                    ) : (
                      <>
                        <span>
                          {price.to > price.from ? `${t("من", "From")} ` : ""}
                          {formatPrice(price.from, currency, lang)}
                        </span>
                        {price.was && (
                          <span className="font-normal text-muted-foreground line-through">
                            {formatPrice(price.was, currency, lang)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
