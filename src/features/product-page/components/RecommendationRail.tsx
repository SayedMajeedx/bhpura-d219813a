import { Link } from "@tanstack/react-router";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { shouldShowPrices } from "@/lib/storefront-mode";
import { trackProductEngagement } from "@/lib/storefront-tracking";
import { ResponsiveImage } from "@/components/responsive-media";
import { type RecommendationProduct } from "@/lib/data/storefront";

export function RecommendationRail({
  title,
  products,
}: {
  title: string;
  products: RecommendationProduct[];
}) {
  const { brand, currency, lang, t, settings } = useStorefront();

  return (
    <section aria-label={title} className="w-full overflow-hidden">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl sm:text-2xl">{title}</h2>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {t("اسحب للمزيد", "Scroll for more")}
        </span>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0 [scrollbar-width:thin]">
        {products.map((item) => {
          const variants = item.product_variants
            .filter((variant) => Number(variant.selling_price || 0) >= 0)
            .sort((a, b) => Number(a.selling_price) - Number(b.selling_price));
          const discounted = variants.find(
            (variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0),
          );
          const priced = discounted ?? variants[0];
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
              <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted">
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
                  <div className="grid h-full place-items-center px-3 text-center text-xs text-muted-foreground">
                    {t("لا توجد صورة", "No image")}
                  </div>
                )}
              </div>
              <div className="mt-2 min-w-0">
                <div className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{name}</div>
                {priced && (
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
                        <span>{formatPrice(Number(priced.selling_price), currency, lang)}</span>
                        {Number(priced.original_price || 0) > Number(priced.selling_price) && (
                          <span className="font-normal text-muted-foreground line-through">
                            {formatPrice(Number(priced.original_price), currency, lang)}
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
