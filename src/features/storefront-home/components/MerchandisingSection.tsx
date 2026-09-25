import { useStorefront } from "@/lib/storefront-context";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveImage } from "@/components/responsive-media";
import { ProductCard } from "@/components/storefront/product-card";
import { SecondaryBannerParallax } from "@/components/storefront/secondary-banner-parallax";
import { type ProductRow } from "@/lib/data/storefront";

/** A home page section heading with bilingual fallbacks. */
export function SectionHeading({
  title,
  fallbackAr,
  fallbackEn,
}: {
  title?: string | null;
  fallbackAr: string;
  fallbackEn: string;
}) {
  const { lang } = useStorefront();
  return (
    <div className="mb-4 sm:mb-6 flex items-end justify-between">
      <h2
        className="font-display text-xl sm:text-2xl font-semibold"
        style={{ color: "var(--sf-heading)" }}
      >
        {title || (lang === "ar" ? fallbackAr : fallbackEn)}
      </h2>
      <div className="h-px flex-1 bg-neutral-100 ms-4" />
    </div>
  );
}

/** Placeholder cards while the home page products load. */
export function SkeletonMerchandisingSection({ label }: { label: [string, string] }) {
  const { lang } = useStorefront();
  return (
    <section className="py-4 sm:py-6 border-t border-border">
      <SectionHeading fallbackAr={label[0]} fallbackEn={label[1]} />
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="flex overflow-x-auto flex-nowrap md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 px-4 md:px-0 md:gap-6 scrollbar-none pb-4 md:pb-0"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[72vw] sm:w-[45vw] md:w-[28vw] min-w-[240px] md:w-auto md:shrink space-y-2"
          >
            <Skeleton className="aspect-[3/4] rounded-xl w-full bg-muted" />
            <Skeleton className="h-4 w-3/4 bg-muted" />
            <Skeleton className="h-4 w-1/3 bg-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A home page product rail (new, best sellers, sale, trending) with its editorial banner and background. */
export function MerchandisingSection({
  kind,
  products,
  bestSellerIds = new Set<string>(),
}: {
  kind: "new" | "best" | "sale" | "trending";
  products: ProductRow[];
  bestSellerIds?: Set<string>;
}) {
  const { settings, lang } = useStorefront();
  if (kind === "new" && !settings.show_new_arrivals) return null;
  const editorial = kind === "new" ? null : settings.homepage_editorial_sections[kind];
  if (editorial && !editorial.enabled) return null;
  if (!products.length) return null;

  const title =
    kind === "new"
      ? lang === "ar"
        ? settings.new_arrivals_title_ar
        : settings.new_arrivals_title_en
      : kind === "best"
        ? lang === "ar"
          ? settings.best_sellers_title_ar
          : settings.best_sellers_title_en
        : null;
  const label =
    kind === "new"
      ? ["وصل حديثاً", "New arrivals"]
      : kind === "best"
        ? ["الأكثر مبيعاً", "Best sellers"]
        : kind === "sale"
          ? ["تنزيلات", "Sale"]
          : ["الرائج الآن", "Trending now"];

  const productGrid = (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="flex overflow-x-auto flex-nowrap gap-4 pb-4 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0 lg:grid-cols-4"
    >
      {products.map((product) => (
        <ProductCard
          key={`${kind}-${product.id}`}
          product={product}
          className="min-w-[240px] w-[72vw] flex-shrink-0 snap-start sm:w-[45vw] md:w-auto md:min-w-0 md:shrink"
          badge={
            kind === "trending"
              ? bestSellerIds.has(product.id)
                ? "best"
                : "trending"
              : kind === "best"
                ? "best"
                : undefined
          }
        />
      ))}
    </div>
  );

  if (!editorial) {
    return (
      <section className="py-4 sm:py-6">
        <SectionHeading title={title} fallbackAr={label[0]} fallbackEn={label[1]} />
        {productGrid}
      </section>
    );
  }

  const sectionStyle = {
    backgroundColor: editorial.background_color || "var(--sf-background)",
    backgroundImage: editorial.background_image_url
      ? `url(${JSON.stringify(editorial.background_image_url)})`
      : undefined,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };

  return (
    <section className="w-full overflow-hidden" style={sectionStyle}>
      {editorial.banner_image_url ? (
        <SecondaryBannerParallax
          enabled={settings.secondary_banner_parallax_enabled}
          mobileEnabled={settings.secondary_banner_parallax_mobile_enabled}
          desktopBreakpoint={settings.secondary_banner_parallax_breakpoint}
          className="min-h-[clamp(14rem,30vw,24rem)] rounded-none"
          backgroundClassName="bg-muted"
          background={
            <ResponsiveImage
              src={editorial.banner_image_url}
              preset="hero"
              sizes="100vw"
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          }
        >
          <div className="mx-auto flex min-h-[clamp(14rem,30vw,24rem)] max-w-7xl items-end px-4 py-10 sm:px-6 sm:py-14">
            <h2 className="max-w-[18ch] font-display text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
              {lang === "ar" ? label[0] : label[1]}
            </h2>
          </div>
        </SecondaryBannerParallax>
      ) : (
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14">
          <h2
            className="font-display text-3xl font-semibold"
            style={{ color: "var(--sf-heading)" }}
          >
            {title || (lang === "ar" ? label[0] : label[1])}
          </h2>
        </div>
      )}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">{productGrid}</div>
    </section>
  );
}
