import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useStorefront, useStoreModules } from "@/lib/storefront-context";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useMemo, useRef, useEffect } from "react";
import { ProductGrid } from "@/components/storefront/product-grid";
import { TrustBar } from "@/components/storefront/TrustBar";
import { BrandStorySection } from "@/components/storefront/BrandStorySection";
import { RecentlyViewed } from "@/components/storefront/RecentlyViewed";
import { PAGE_DATA_RANKING_LIMIT, storefrontQueries } from "@/lib/data/storefront";
import { storeLayoutData } from "@/features/storefront-shell/lib/layout-data";
import { categoryPathParam, parseCategoryPath } from "@/features/storefront-home/lib/category-path";
import {
  homeGridProducts,
  homeMerchandising,
  homeSectionBackgrounds,
  promoAreaShows,
  trustBarBelowHero,
} from "@/features/storefront-home/lib/home-products";
import { PromoCards } from "@/features/storefront-home/components/PromoCards";
import {
  SectionHeading,
  SkeletonMerchandisingSection,
  MerchandisingSection,
} from "@/features/storefront-home/components/MerchandisingSection";
import { HeroBanner } from "@/features/storefront-home/components/HeroBanner";
import { Categories } from "@/features/storefront-home/components/Categories";
import { BookingInvite } from "@/features/storefront-booking/components/BookingEntryPoints";
import { ServicesHome } from "@/features/services-home/components/ServicesHome";
import { MenuHome } from "@/features/storefront-home/components/MenuHome";
import { isCatalogMode } from "@/lib/storefront-mode";
import {
  PRODUCT_PHOTO_CLASS,
  productCardRatio,
  storefrontHomeLayout,
} from "@/lib/brand-templates/design-presets";
import { isServicesStore } from "@/features/services-home/lib/services-home";

export const Route = createFileRoute("/$slug/")({
  // The chosen category lives in the address (?cat=...), so the logo and the back button work.
  validateSearch: (search: Record<string, unknown>): { cat?: string } =>
    typeof search.cat === "string" && search.cat.trim() ? { cat: search.cat } : {},
  // The store's layout has just read this same page data; asking the database again doubled the
  // work of every home page load and cost a second round trip when coming back to the home page.
  loader: async ({ parentMatchPromise }) => {
    const pageData = storeLayoutData((await parentMatchPromise).loaderData).bootstrapData;
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
  const modules = useStoreModules();
  const loaderData = Route.useLoaderData();
  const { cat } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeCategorySlugs = useMemo(() => parseCategoryPath(cat), [cat]);
  const activeCat = activeCategorySlugs[0] || null;
  // A new history entry per choice: back returns to the previous filter, the logo to the
  // unfiltered page. The page scrolls to the products itself (below), not to the top.
  const setActiveCategorySlugs = useCallback(
    (path: string[]) =>
      void navigate({ search: { cat: categoryPathParam(path) }, resetScroll: false }),
    [navigate],
  );

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

  // A product shows in one rail only, among the rails the page draws (the grid stays whole).
  const editorialSections = settings.homepage_editorial_sections;
  const { newest, bestSellers, saleProducts, trending } = useMemo(
    () =>
      homeMerchandising(products ?? [], bestSellerRows, trendingRows, {
        new: Boolean(settings.show_new_arrivals),
        best: editorialSections.best.enabled,
        sale: editorialSections.sale.enabled,
        trending: editorialSections.trending.enabled,
      }),
    [products, bestSellerRows, trendingRows, settings.show_new_arrivals, editorialSections],
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

  // A store that only sells services gets its services page instead of a product shop.
  if (!isLoading && isServicesStore(modules.bookings, products ?? [])) {
    return <ServicesHome products={products ?? []} />;
  }
  // A store that sells by quick order (a bakery, a roastery) gets its menu; a catalog store has
  // no basket to fill, so it keeps the shop's home.
  if (!isLoading && storefrontHomeLayout(settings) === "menu" && !isCatalogMode(settings)) {
    return <MenuHome products={products ?? []} categories={categories ?? []} />;
  }

  // Loading state with premium skeleton carousels/grids
  if (isLoading) {
    return (
      <div>
        <HeroBanner />
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
          <PromoCards />
          <div className="space-y-8 sm:space-y-12">
            {settings.show_new_arrivals && (
              <SkeletonMerchandisingSection label={["وصل حديثاً", "New arrivals"]} />
            )}
            <SkeletonMerchandisingSection label={["الأكثر مبيعاً", "Best sellers"]} />
          </div>
          <div className="mt-8 pt-6 sm:pt-8 border-t border-border">
            <SectionHeading fallbackAr="كل المنتجات" fallbackEn="All products" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton
                    className={`${PRODUCT_PHOTO_CLASS[productCardRatio(settings)]} rounded-xl w-full bg-muted`}
                  />
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

  const showTrustBarBelowHero = trustBarBelowHero(settings);

  return (
    <div>
      <HeroBanner />
      {showTrustBarBelowHero && <TrustBar />}
      <BookingInvite />
      {/* Left out when it has nothing: drawn empty, its background and padding were a bare band. */}
      {promoAreaShows({
        cards: settings.home_promo_cards,
        showNewArrivals: settings.show_new_arrivals,
        newest,
        activeCat,
      }) && (
        <section className="w-full" style={{ backgroundColor: promoAreaBackground }}>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <PromoCards />
            {!activeCat && <MerchandisingSection kind="new" products={newest} />}
          </div>
        </section>
      )}
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
