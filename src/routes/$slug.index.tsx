import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useRef, useEffect } from "react";
import { ProductGrid } from "@/components/storefront/product-grid";
import { TrustBar } from "@/components/storefront/TrustBar";
import { BrandStorySection } from "@/components/storefront/BrandStorySection";
import { RecentlyViewed } from "@/components/storefront/RecentlyViewed";
import {
  PAGE_DATA_RANKING_LIMIT,
  fetchStorefrontPageData,
  storefrontQueries,
} from "@/lib/data/storefront";
import {
  homeGridProducts,
  homeMerchandising,
  homeSectionBackgrounds,
} from "@/features/storefront-home/lib/home-products";
import { PromoCards } from "@/features/storefront-home/components/PromoCards";
import {
  SectionHeading,
  SkeletonMerchandisingSection,
  MerchandisingSection,
} from "@/features/storefront-home/components/MerchandisingSection";
import { HeroBanner } from "@/features/storefront-home/components/HeroBanner";
import { Categories } from "@/features/storefront-home/components/Categories";

export const Route = createFileRoute("/$slug/")({
  loader: async ({ params }) => {
    const pageData = await fetchStorefrontPageData(params.slug);
    return {
      products: pageData?.products ?? [],
      categories: pageData?.categories ?? [],
      bestSellerRows: pageData?.bestSellerRows ?? [],
      trendingRows: pageData?.trendingRows ?? [],
    };
  },
  component: StoreHome,
});

function StoreHome() {
  const { brand, settings } = useStorefront();
  const loaderData = Route.useLoaderData();
  const [activeCategorySlugs, setActiveCategorySlugs] = useState<string[]>([]);
  const activeCat = activeCategorySlugs[0] || null;

  const productsSectionRef = useRef<HTMLDivElement>(null);
  const prevCatRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeCat && prevCatRef.current !== activeCat) {
      setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    }
    prevCatRef.current = activeCat;
  }, [activeCat]);

  // The loader's page data seeds each query; the shared options keep the same
  // columns when the client refetches.
  const { data: products, isLoading } = useQuery({
    ...storefrontQueries.products(brand),
    initialData: loaderData.products,
  });

  const { data: categories } = useQuery({
    ...storefrontQueries.categories(brand),
    initialData: loaderData.categories,
  });

  const { data: bestSellerRows } = useQuery({
    ...storefrontQueries.bestSellers(brand, PAGE_DATA_RANKING_LIMIT),
    initialData: loaderData.bestSellerRows,
  });

  const { data: trendingRows } = useQuery({
    ...storefrontQueries.trending(brand, PAGE_DATA_RANKING_LIMIT),
    initialData: loaderData.trendingRows,
  });

  // Directly map merchandising sections with NO deduplication logic
  const { newest, bestSellers, saleProducts, trending } = useMemo(
    () => homeMerchandising(products ?? [], bestSellerRows, trendingRows),
    [products, bestSellerRows, trendingRows],
  );

  const filtered = useMemo(
    () =>
      homeGridProducts({
        products: products ?? [],
        activeCategorySlugs,
        categories: categories ?? [],
        bestSellerRows,
        now: Date.now(),
      }),
    [products, activeCategorySlugs, categories, bestSellerRows],
  );

  const bestIdsKeys = useMemo(() => {
    return new Set<string>((bestSellerRows ?? []).map((row: any) => String(row.product_id)));
  }, [bestSellerRows]);

  const { productsAreaBackground, promoAreaBackground } = homeSectionBackgrounds({
    editorialSections: settings.homepage_editorial_sections,
    bestSellers,
    saleProducts,
    trending,
    activeCat,
  });

  // Loading state with premium skeleton carousels/grids
  if (isLoading) {
    return (
      <div>
        <HeroBanner />
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
          <PromoCards />
          <div className="space-y-8 sm:space-y-12">
            <SkeletonMerchandisingSection label={["وصل حديثاً", "New arrivals"]} />
            <SkeletonMerchandisingSection label={["الأكثر مبيعاً", "Best sellers"]} />
          </div>
          <div className="mt-8 pt-6 sm:pt-8 border-t border-border">
            <SectionHeading fallbackAr="كل المنتجات" fallbackEn="All products" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[3/4] rounded-xl w-full bg-muted" />
                  <Skeleton className="h-4 w-3/4 bg-muted" />
                  <Skeleton className="h-4 w-1/3 bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const showTrustBarBelowHero =
    settings?.trust_bar_enabled !== false &&
    (settings?.trust_bar_position === "below_hero" ||
      settings?.trust_bar_position === "both" ||
      !settings?.trust_bar_position);

  return (
    <div>
      <HeroBanner />
      {showTrustBarBelowHero && <TrustBar />}
      <section className="w-full" style={{ backgroundColor: promoAreaBackground }}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <PromoCards />
          {!activeCat && <MerchandisingSection kind="new" products={newest} />}
        </div>
      </section>
      {!activeCat && (
        <div>
          <MerchandisingSection kind="best" products={bestSellers} />
          <MerchandisingSection kind="sale" products={saleProducts} />
          <MerchandisingSection kind="trending" products={trending} bestSellerIds={bestIdsKeys} />
        </div>
      )}
      <section className="w-full pb-8 sm:pb-12" style={{ backgroundColor: productsAreaBackground }}>
        <div
          ref={productsSectionRef}
          id="products-section"
          className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-8 sm:px-6 sm:pt-12"
        >
          <SectionHeading
            title={activeCat ? undefined : null}
            fallbackAr="كل المنتجات"
            fallbackEn="All products"
          />
          <Categories
            products={products ?? []}
            categories={categories ?? []}
            activeCategorySlugs={activeCategorySlugs}
            setActiveCategorySlugs={setActiveCategorySlugs}
          />
          <ProductGrid
            products={filtered}
            loading={isLoading}
            categoryEmpty={activeCat !== null}
            onViewAll={() => setActiveCategorySlugs([])}
          />
        </div>
      </section>

      {/* Brand Story Section (Layer 2) */}
      {settings.storefront_design_version === 2 && settings.brand_story_enabled !== false && (
        <BrandStorySection />
      )}

      {/* Recently Viewed Carousel (Layer 2) */}
      {settings.recently_viewed_enabled !== false && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <RecentlyViewed />
        </div>
      )}
    </div>
  );
}
