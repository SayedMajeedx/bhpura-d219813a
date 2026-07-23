import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useRef, type AnchorHTMLAttributes } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Grid2X2, Heart } from "lucide-react";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { ProductCard } from "@/components/storefront/product-card";
import { ProductGrid } from "@/components/storefront/product-grid";

function getDescendantCategories(catId: string, categories: any[]): any[] {
  const descendants: any[] = [];
  const queue = categories.filter(c => c.parent_id === catId);
  while (queue.length > 0) {
    const current = queue.shift()!;
    descendants.push(current);
    const children = categories.filter(c => c.parent_id === current.id);
    queue.push(...children);
  }
  return descendants;
}

export const Route = createFileRoute("/$slug/")({
  component: StoreHome,
});

export type ProductRow = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  category: string | null;
  image_url: string | null;
  media: unknown;
  brand_id: string;
  created_at: string;
  featured_trending?: boolean;
  show_sale_badge?: boolean;
  product_variants: Array<{
    id: string;
    selling_price: number;
    original_price: number | null;
    stock_main: number;
    size: string | null;
    color: string | null;
  }>;
};

type CategoryRow = {
  id: string;
  name_en: string;
  name_ar: string | null;
  slug: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
};

function StoreHome() {
  const { brand } = useStorefront();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeSubCat, setActiveSubCat] = useState<string | null>(null);
  const [activeSubSubCat, setActiveSubSubCat] = useState<string | null>(null);

  const handleSelectCat = (cat: string | null) => {
    setActiveCat(cat);
    setActiveSubCat(null);
    setActiveSubSubCat(null);
  };

  const handleSelectSubCat = (sub: string | null) => {
    setActiveSubCat(sub);
    setActiveSubSubCat(null);
  };

  const { data: products, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, featured_trending, show_sale_badge, product_variants(id, selling_price, original_price, stock_main, size, color)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: categories } = useQuery({
    queryKey: ["storefront", brand.slug, "categories"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, slug, image_url, parent_id, sort_order")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: bestSellerRows } = useQuery({
    queryKey: ["storefront", brand.slug, "best-sellers"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_storefront_best_sellers", { p_brand_slug: brand.slug, p_limit: 8 });
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; units_sold: number }>;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: trendingRows } = useQuery({
    queryKey: ["storefront", brand.slug, "trending"],
    queryFn: async () => { 
      const { data, error } = await (supabase.rpc as any)("get_storefront_trending", { p_brand_slug: brand.slug, p_limit: 8 }); 
      if (error) throw error; 
      return data ?? []; 
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Directly map merchandising sections with NO deduplication logic
  const { newest, bestSellers, saleProducts, trending } = useMemo(() => {
    const list = products ?? [];

    // 1. New Arrivals
    const newestList = list.slice(0, 8);

    // 2. Best Sellers (mapped to RPC best sellers)
    const bestIds = new Map((bestSellerRows ?? []).map((row, index) => [row.product_id, index]));
    const bestSellersList = list
      .filter((p) => bestIds.has(p.id))
      .sort((a, b) => (bestIds.get(a.id) ?? 99) - (bestIds.get(b.id) ?? 99))
      .slice(0, 8);

    // 3. Sale (where original_price > selling_price)
    const saleList = list
      .filter((p) =>
        p.product_variants.some((v) => Number(v.original_price || 0) > Number(v.selling_price || 0))
      )
      .slice(0, 8);

    // 4. Trending Now (mapped to RPC trending)
    const trendingIds = new Map<string, number>((trendingRows ?? []).map((row: any, index: number) => [row.product_id, index]));
    const trendingList = list
      .filter((p) => trendingIds.has(p.id))
      .sort((a, b) => (trendingIds.get(a.id) ?? 99) - (trendingIds.get(b.id) ?? 99))
      .slice(0, 8);

    return {
      newest: newestList,
      bestSellers: bestSellersList,
      saleProducts: saleList,
      trending: trendingList,
    };
  }, [products, bestSellerRows, trendingRows]);

  // All Products Grid (bottom section) - Filters smart tabs dynamically to avoid empty states
  const filtered = useMemo(() => {
    const list = products ?? [];
    if (activeCat) {
      const catSlug = activeCat.toLowerCase().replace(/\s+/g, "-");
      const isNew = ["new-arrivals", "new"].includes(catSlug);
      const isBest = ["most-selling", "best-sellers", "best-selling"].includes(catSlug);
      const isSale = ["offers", "sale", "discounts"].includes(catSlug);

      if (isNew) {
        return list;
      }
      if (isBest) {
        const bestIds = new Map((bestSellerRows ?? []).map((row, index) => [row.product_id, index]));
        return list
          .filter((p) => bestIds.has(p.id))
          .sort((a, b) => (bestIds.get(a.id) ?? 99) - (bestIds.get(b.id) ?? 99));
      }
      if (isSale) {
        return list.filter((p) =>
          p.product_variants.some((v) => Number(v.original_price || 0) > Number(v.selling_price || 0))
        );
      }

      // If activeSubSubCat is selected, filter strictly by it (including any deeper subcategories recursively)
      if (activeSubSubCat) {
        const subSubCat = categories?.find(c => c.slug === activeSubSubCat || c.name_en === activeSubSubCat);
        if (subSubCat) {
          const descendants = getDescendantCategories(subSubCat.id, categories ?? []);
          const matchSlugs = new Set([
            activeSubSubCat.toLowerCase().replace(/\s+/g, "-"),
            ...descendants.map(c => c.slug?.toLowerCase()).filter(Boolean),
            ...descendants.map(c => c.name_en?.toLowerCase()).filter(Boolean)
          ]);
          return list.filter((p) => {
            const pCat = p.category?.toLowerCase();
            return pCat && matchSlugs.has(pCat);
          });
        }
        const subSubCatSlug = activeSubSubCat.toLowerCase().replace(/\s+/g, "-");
        return list.filter((p) => p.category === activeSubSubCat || p.category?.toLowerCase() === subSubCatSlug);
      }

      // If activeSubCat is selected, filter strictly by it (including its own sub-subcategories recursively!)
      if (activeSubCat) {
        const subCat = categories?.find(c => c.slug === activeSubCat || c.name_en === activeSubCat);
        if (subCat) {
          const descendants = getDescendantCategories(subCat.id, categories ?? []);
          const matchSlugs = new Set([
            activeSubCat.toLowerCase().replace(/\s+/g, "-"),
            ...descendants.map(c => c.slug?.toLowerCase()).filter(Boolean),
            ...descendants.map(c => c.name_en?.toLowerCase()).filter(Boolean)
          ]);
          return list.filter((p) => {
            const pCat = p.category?.toLowerCase();
            return pCat && matchSlugs.has(pCat);
          });
        }
        const subCatSlug = activeSubCat.toLowerCase().replace(/\s+/g, "-");
        return list.filter((p) => p.category === activeSubCat || p.category?.toLowerCase() === subCatSlug);
      }

      // Find the database ID of the active parent category
      const parentCat = categories?.find(c => !c.parent_id && (c.slug === activeCat || c.name_en === activeCat));
      if (parentCat) {
        // Find all child subcategory slugs/names recursively!
        const childCats = getDescendantCategories(parentCat.id, categories ?? []);
        const matchSlugs = new Set([
          activeCat.toLowerCase().replace(/\s+/g, "-"),
          ...childCats.map(c => c.slug?.toLowerCase()).filter(Boolean),
          ...childCats.map(c => c.name_en?.toLowerCase()).filter(Boolean)
        ]);
        
        return list.filter((p) => {
          const pCat = p.category?.toLowerCase();
          return pCat && matchSlugs.has(pCat);
        });
      }

      return list.filter((p) => p.category === activeCat || p.category?.toLowerCase() === catSlug);
    }
    return list;
  }, [products, activeCat, activeSubCat, activeSubSubCat, categories, bestSellerRows]);

  const bestIdsKeys = useMemo(() => {
    return new Set((bestSellerRows ?? []).map(row => row.product_id));
  }, [bestSellerRows]);

  // Loading state with premium skeleton carousels/grids
  if (isLoading) {
    return (
      <div>
        <HeroBanner />
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 md:py-16">
          <PromoCards />
          <div className="space-y-16">
            <SkeletonMerchandisingSection label={["وصل حديثاً", "New arrivals"]} />
            <SkeletonMerchandisingSection label={["الأكثر مبيعاً", "Best sellers"]} />
          </div>
          <div className="mt-16 pt-12 border-t border-neutral-100/50">
            <SectionHeading fallbackAr="كل المنتجات" fallbackEn="All products" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[3/4] rounded-xl w-full animate-pulse bg-neutral-100" />
                  <Skeleton className="h-4 w-3/4 animate-pulse bg-neutral-100" />
                  <Skeleton className="h-4 w-1/3 animate-pulse bg-neutral-100" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <HeroBanner />
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 md:py-16">
        <PromoCards />
        {!activeCat && (
          <div className="space-y-16">
            <MerchandisingSection kind="new" products={newest} />
            <MerchandisingSection kind="best" products={bestSellers} />
            <MerchandisingSection kind="sale" products={saleProducts} />
            <MerchandisingSection kind="trending" products={trending} bestSellerIds={bestIdsKeys} />
          </div>
        )}

        <div className={`pt-12 ${!activeCat ? "border-t border-neutral-100/50" : ""}`}>
          <SectionHeading title={activeCat ? undefined : null} fallbackAr="كل المنتجات" fallbackEn="All products" />
          <Categories
            products={products ?? []}
            categories={categories ?? []}
            activeCat={activeCat}
            activeSubCat={activeSubCat}
            activeSubSubCat={activeSubSubCat}
            onSelect={handleSelectCat}
            onSelectSub={handleSelectSubCat}
            onSelectSubSub={setActiveSubSubCat}
          />
          <ProductGrid
            products={filtered}
            loading={isLoading}
            categoryEmpty={activeCat !== null}
            onViewAll={() => setActiveCat(null)}
          />
        </div>
      </section>
    </div>
  );
}

function PromoCards() {
  const { settings, lang } = useStorefront();
  const cards = settings.home_promo_cards.filter((card) => card && (card.image_url || card.title_en || card.title_ar));
  if (!cards.length) return null;
  return (
    <div className="mb-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {cards.map((card, index) => {
        const title = lang === "ar" ? card.title_ar || card.title_en : card.title_en || card.title_ar;
        const subtitle = lang === "ar" ? card.subtitle_ar || card.subtitle_en : card.subtitle_en || card.subtitle_ar;
        return (
          <StorefrontLink
            key={index}
            href={card.href || "#products"}
            className="group relative aspect-[16/9] overflow-hidden rounded-2xl border shadow-sm sm:aspect-[2/1]"
            style={{ backgroundColor: card.background_color || "#f4f4f4", color: card.text_color || "#111111" }}
          >
            {card.image_url && (
              <ResponsiveImage
                src={card.image_url}
                preset="content"
                sizes="(min-width: 640px) 50vw, 100vw"
                alt={title || ""}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
            <div className="relative flex h-full flex-col justify-end p-6">
              <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
              {subtitle && <p className="mt-1 max-w-md text-sm opacity-90">{subtitle}</p>}
            </div>
          </StorefrontLink>
        );
      })}
    </div>
  );
}

function SectionHeading({ title, fallbackAr, fallbackEn }: { title?: string | null; fallbackAr: string; fallbackEn: string }) {
  const { lang } = useStorefront();
  return (
    <div className="mb-8 flex items-end justify-between">
      <h2 className="font-display text-2xl sm:text-3xl" style={{ color: "var(--sf-heading)" }}>
        {title || (lang === "ar" ? fallbackAr : fallbackEn)}
      </h2>
      <div className="h-px flex-1 bg-neutral-100 ms-5" />
    </div>
  );
}

function SkeletonMerchandisingSection({ label }: { label: [string, string] }) {
  const { lang } = useStorefront();
  return (
    <section className="py-12 border-t border-neutral-100/50">
      <SectionHeading fallbackAr={label[0]} fallbackEn={label[1]} />
      <div 
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="flex overflow-x-auto flex-nowrap md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 px-4 md:px-0 md:gap-6 scrollbar-none pb-4 md:pb-0"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[72vw] sm:w-[45vw] md:w-[28vw] min-w-[240px] md:w-auto md:shrink space-y-2">
            <Skeleton className="aspect-[3/4] rounded-xl w-full animate-pulse bg-neutral-100" />
            <Skeleton className="h-4 w-3/4 animate-pulse bg-neutral-100" />
            <Skeleton className="h-4 w-1/3 animate-pulse bg-neutral-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

function MerchandisingSection({
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
  if (kind === "best" && (!settings.show_best_sellers || !products.length)) return null;
  if ((kind === "sale" || kind === "trending") && !products.length) return null;

  const title = kind === "new"
    ? (lang === "ar" ? settings.new_arrivals_title_ar : settings.new_arrivals_title_en)
    : kind === "best" ? (lang === "ar" ? settings.best_sellers_title_ar : settings.best_sellers_title_en) : null;
  const label = kind === "new" ? ["وصل حديثاً", "New arrivals"] : kind === "best" ? ["الأكثر مبيعاً", "Best sellers"] : kind === "sale" ? ["تنزيلات", "Sale"] : ["الرائج الآن", "Trending now"];

  return (
    <section className="py-12 border-t border-neutral-100/50">
      <SectionHeading title={title} fallbackAr={label[0]} fallbackEn={label[1]} />
      <div 
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="flex overflow-x-auto flex-nowrap md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 px-4 md:px-0 md:gap-6 scrollbar-none pb-4 md:pb-0 snap-x snap-mandatory"
      >
        {products.map((product) => (
          <ProductCard
            key={`${kind}-${product.id}`}
            product={product}
            className="flex-shrink-0 w-[72vw] sm:w-[45vw] md:w-[28vw] min-w-[240px] snap-start md:w-auto md:shrink md:snap-align-none"
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
    </section>
  );
}

function HeroBanner() {
  const { brand, settings } = useStorefront();
  const background = brand.hero_media?.background;
  const slides = brand.hero_media?.slides?.length ? brand.hero_media.slides : [{
    id: "legacy-hero", type: "text" as const,
    title_en: settings.hero_title_en || brand.name_en,
    title_ar: settings.hero_title_ar || brand.name_ar || brand.name_en,
    body_en: brand.about_en || "A curated collection made for you.",
    body_ar: brand.about_ar || "مجموعة مختارة بعناية لك.",
    media_url: "", button_en: "Shop now", button_ar: "تسوّق الآن", button_href: "#products",
  }];

  return (
    <section className="relative w-full overflow-hidden min-h-[280px] py-6 sm:min-h-[55vh] sm:max-h-[640px] sm:py-0">
      {background ? (
        <div className="absolute inset-0">
          {background.type === "video" ? <OptimizedVideo src={background.url} active className="h-full w-full object-cover" /> : <ResponsiveImage src={background.url} preset="hero" sizes="100vw" alt="" className="h-full w-full object-cover" decoding="async" fetchPriority="high" />}
          <div className="absolute inset-0 bg-black/20" />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${settings.primary_color}22, ${settings.primary_color}66)`,
          }}
        />
      )}

      <div className="relative z-10 mx-auto flex max-w-7xl items-center px-4 min-h-[280px] sm:min-h-[55vh] sm:px-6">
        <HeroContentCarousel slides={slides} />
      </div>
    </section>
  );
}

function HeroContentCarousel({ slides }: { slides: import("@/lib/storefront-context").HeroContentSlide[] }) {
  const { settings, lang } = useStorefront();
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const blockedClick = useRef(false);

  const goTo = (next: number) => {
    const safe = (next + slides.length) % slides.length;
    setIdx(safe);
  };

  const finishSwipe = (endX: number | undefined) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX == null || endX == null) return;
    const distance = endX - startX;
    if (Math.abs(distance) < 42) return;
    blockedClick.current = true;
    goTo(distance < 0 ? idx + 1 : idx - 1);
    window.setTimeout(() => { blockedClick.current = false; }, 0);
  };

  let preparedVideoIndex = -1;
  for (let offset = 1; offset < slides.length; offset += 1) {
    const candidate = (idx + offset) % slides.length;
    if (slides[candidate]?.type === "video") {
      preparedVideoIndex = candidate;
      break;
    }
  }

  return (
    <div className="relative isolate w-[88%] max-w-xl overflow-hidden rounded-2xl bg-transparent shadow-lg [clip-path:inset(0_round_1rem)] [transform:translateZ(0)] sm:w-full">
      <div
        dir="ltr"
        className="grid items-stretch overflow-hidden rounded-2xl [clip-path:inset(0_round_1rem)] touch-pan-y"
        onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX)}
        onTouchCancel={() => { touchStartX.current = null; }}
        onClickCapture={(event) => {
          if (!blockedClick.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {slides.map((slide, slideIndex) => {
          const title = lang === "ar" ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar;
          const body = lang === "ar" ? slide.body_ar || slide.body_en : slide.body_en || slide.body_ar;
          const button = lang === "ar" ? slide.button_ar || slide.button_en : slide.button_en || slide.button_ar;
          const mediaUrl = (lang === "ar" ? slide.media_url_ar : slide.media_url_en) || slide.media_url || (lang === "ar" ? slide.media_url_en : slide.media_url_ar) || "";
          const streamIframeUrl = (lang === "ar" ? slide.media_iframe_url_ar : slide.media_iframe_url_en) || (lang === "ar" ? slide.media_iframe_url_en : slide.media_iframe_url_ar) || "";
          const posterUrl = (lang === "ar" ? slide.media_poster_url_ar : slide.media_poster_url_en) || (lang === "ar" ? slide.media_poster_url_en : slide.media_poster_url_ar) || mediaUrl;
          return (
            <article key={slide.id} dir={lang === "ar" ? "rtl" : "ltr"} aria-hidden={slideIndex !== idx} className={`col-start-1 row-start-1 aspect-video min-w-0 overflow-hidden rounded-2xl transition-[opacity,transform,filter] duration-[680ms] ease-[cubic-bezier(0.22,1,0.36,1)] [backface-visibility:hidden] [clip-path:inset(0_round_1rem)] will-change-[opacity,transform] sm:duration-[720ms] ${slideIndex === idx ? "z-10 pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0" : "z-0 pointer-events-none translate-y-1 scale-[0.992] opacity-0 blur-[1px]"}`}>
              {slide.type === "image" && mediaUrl ? <StorefrontLink href={slide.button_href || "#products"} className="block h-full w-full overflow-hidden rounded-2xl sm:h-[320px]"><ResponsiveImage src={mediaUrl} preset="hero" sizes="100vw" alt={title || ""} className="h-full w-full object-cover" fetchPriority={slideIndex === 0 ? "high" : "auto"} loading={slideIndex === 0 ? "eager" : "lazy"} /></StorefrontLink> : slide.type === "video" && (mediaUrl || streamIframeUrl) ? <StorefrontLink href={slide.button_href || "#products"} className="block h-full w-full cursor-pointer overflow-hidden rounded-2xl sm:h-[320px]" aria-label={title || (lang === "ar" ? "فتح الرابط" : "Open link")}><OptimizedVideo src={streamIframeUrl ? undefined : mediaUrl} streamIframeUrl={streamIframeUrl} poster={posterUrl} active={slideIndex === idx} prepare={!streamIframeUrl && slideIndex === preparedVideoIndex} preload={slideIndex === idx ? "auto" : undefined} className="pointer-events-none h-full w-full object-contain sm:object-cover" wrapperClassName="pointer-events-none h-full w-full overflow-hidden" /></StorefrontLink> : <div className="flex h-full flex-col justify-center overflow-hidden rounded-2xl bg-white/85 px-4 pb-11 pt-3 backdrop-blur sm:h-[320px] sm:p-8 sm:pb-20" style={{ textAlign: settings.hero_title_align }}>
                {settings.show_hero_title && title && <h1 className="mb-1 leading-tight sm:mb-3" style={{ color: settings.hero_title_color ?? "var(--sf-heading)", fontSize: `clamp(1.25rem, 5vw, ${settings.hero_title_size}px)`, fontFamily: "var(--sf-font)" }}>{title}</h1>}
                {settings.show_hero_about && body && <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-neutral-700 sm:mb-4 sm:line-clamp-none sm:text-base">{body}</p>}
                {button && <div><StorefrontLink href={slide.button_href || "#products"} className="inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold sm:px-6 sm:py-3 sm:text-base" style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)" }}>{button}</StorefrontLink></div>}
              </div>}
            </article>
          );
        })}
      </div>
      {slides.length > 1 && <div dir="ltr" className="pointer-events-none absolute inset-x-3 bottom-1 flex items-center justify-between text-white mix-blend-difference sm:inset-x-5 sm:bottom-6">
        <button type="button" onClick={() => goTo(idx - 1)} aria-label={lang === "ar" ? "الشريحة السابقة" : "Previous hero slide"} className="pointer-events-auto grid h-10 w-10 place-items-center bg-transparent transition duration-300 hover:scale-110 hover:opacity-70 active:scale-95"><ChevronLeft strokeWidth={1} className="h-7 w-7" /></button>
        <div className="pointer-events-auto flex items-center justify-center gap-2 pb-1">{slides.map((slide, dot) => <button key={slide.id} type="button" onClick={() => goTo(dot)} aria-label={`${lang === "ar" ? "الشريحة" : "Hero slide"} ${dot + 1}`} aria-current={dot === idx ? "true" : undefined} className={`h-px transition-all duration-500 ${dot === idx ? "w-8 bg-current" : "w-3 bg-current opacity-50"}`} />)}</div>
        <button type="button" onClick={() => goTo(idx + 1)} aria-label={lang === "ar" ? "الشريحة التالية" : "Next hero slide"} className="pointer-events-auto grid h-10 w-10 place-items-center bg-transparent transition duration-300 hover:scale-110 hover:opacity-70 active:scale-95"><ChevronRight strokeWidth={1} className="h-7 w-7" /></button>
      </div>}
    </div>
  );
}

function StorefrontLink({ href, ...props }: { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const value = String(href || "#products").trim();
  const internalAbsolute = /^https?:\/\/(?:www\.)?(?:[a-zA-Z0-9-]+\.)?(?:boutq\.store|vercel\.app)(?:\/|$)/i.test(value);
  const destination = internalAbsolute ? value.replace(/^https?:\/\/[^/]+/i, "") || "/" : value;
  const external = /^(?:https?:)?\/\//i.test(destination) || /^(?:mailto|tel):/i.test(destination);
  if (external || destination.startsWith("#")) return <a href={destination} {...props} />;
  return <Link to={destination as any} preload="intent" {...(props as any)} />;
}

function Categories({
  products,
  categories,
  activeCat,
  activeSubCat,
  activeSubSubCat,
  onSelect,
  onSelectSub,
  onSelectSubSub,
  navigation = false,
}: {
  products: ProductRow[];
  categories: CategoryRow[];
  activeCat: string | null;
  activeSubCat: string | null;
  activeSubSubCat: string | null;
  onSelect: (c: string | null) => void;
  onSelectSub: (c: string | null) => void;
  onSelectSubSub: (c: string | null) => void;
  navigation?: boolean;
}) {
  const { t, lang, brand, settings } = useStorefront();
  const menuBackground = settings.menu_bg || settings.background_color || "#ffffff";
  const menuText = settings.menu_fg || settings.text_color || "#111111";

  const merged = useMemo(() => {
    const known = new Map<string, { id: string; key: string; label: string; image: string | null }>();
    // Pre-filter to only parent categories (no parent_id)
    const parents = categories.filter((c) => !c.parent_id);
    for (const c of parents) {
      const key = c.slug || c.name_en;
      const label = (lang === "ar" ? c.name_ar : c.name_en) || c.name_en;
      known.set(key, { id: c.id, key, label, image: c.image_url });
    }
    for (const p of products) {
      if (p.category && !known.has(p.category)) {
        // Subcategories with no parent_id match get treated as parents (unchanged behavior for flat catalogs)
        const isSub = categories.some((c) => c.parent_id && (c.slug === p.category || c.name_en === p.category));
        if (!isSub) {
          known.set(p.category, { id: "", key: p.category, label: p.category, image: null });
        }
      }
    }
    return Array.from(known.values());
  }, [categories, products, lang]);

  // Generate dynamic, active subcategories that have product representations in active catalog list
  const subcategoriesWithProducts = useMemo(() => {
    if (!activeCat) return [];
    const parentCatItem = categories.find(
      (c) => !c.parent_id && (c.slug === activeCat || c.name_en === activeCat)
    );
    if (!parentCatItem) return [];

    const subs = categories.filter((sub) => sub.parent_id === parentCatItem.id);
    return subs.filter((sub) => {
      const descendants = getDescendantCategories(sub.id, categories);
      const matchValues = new Set([
        sub.slug,
        sub.name_en,
        ...descendants.map(d => d.slug).filter(Boolean),
        ...descendants.map(d => d.name_en).filter(Boolean)
      ].filter(Boolean));
      return products.some((p) => p.category && matchValues.has(p.category));
    });
  }, [activeCat, categories, products]);

  // Generate dynamic, active sub-subcategories that have product representations in active catalog list
  const subSubcategoriesWithProducts = useMemo(() => {
    if (!activeSubCat) return [];
    const subCatItem = categories.find(
      (c) => c.parent_id && (c.slug === activeSubCat || c.name_en === activeSubCat)
    );
    if (!subCatItem) return [];

    const subs = categories.filter((sub) => sub.parent_id === subCatItem.id);
    return subs.filter((sub) => {
      const descendants = getDescendantCategories(sub.id, categories);
      const matchValues = new Set([
        sub.slug,
        sub.name_en,
        ...descendants.map(d => d.slug).filter(Boolean),
        ...descendants.map(d => d.name_en).filter(Boolean)
      ].filter(Boolean));
      return products.some((p) => p.category && matchValues.has(p.category));
    });
  }, [activeSubCat, categories, products]);

  if (merged.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      <div dir={lang === "ar" ? "rtl" : "ltr"} className={`${navigation ? "my-2 min-h-16 w-full items-center justify-start border-b py-2 sm:justify-center" : "justify-center"} flex flex-wrap gap-3`}>
        {navigation && <details className="group relative shrink-0">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-dashed px-5 font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md [&::-webkit-details-marker]:hidden"><Grid2X2 className="h-5 w-5" /><span>{t("القائمة", "Menu")}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
          <div className="absolute start-0 top-full z-50 mt-2 w-[min(92vw,620px)] rounded-2xl border p-5 shadow-2xl" style={{ backgroundColor: menuBackground, color: menuText }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground"><Grid2X2 className="h-4 w-4" />{t("الأقسام", "Categories")}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{merged.map((item) => <Link key={`menu-${item.key}`} to="/$slug/$category" params={{ slug: brand.slug, category: item.key }} className="flex min-h-14 items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary"><div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">{item.image ? <ResponsiveImage src={item.image} preset="thumb" sizes="40px" alt="" className="h-full w-full object-cover" /> : <Grid2X2 className="h-4 w-4 opacity-50" />}</div><span className="font-medium">{item.label}</span></Link>)}</div>
            {settings.menu_show_pages && settings.pages.some((page) => page.title_ar || page.title_en) && <><div className="my-5 border-t" /><div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="h-4 w-4" />{t("الصفحات", "Pages")}</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{settings.pages.map((page, index) => { const title = lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar; return title ? <Link key={`page-${index}`} to="/$slug/$category" params={{ slug: brand.slug, category: page.slug }} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-secondary"><FileText className="h-4 w-4 shrink-0 opacity-60" /><span className="truncate">{title}</span></Link> : null; })}</div></>}
          </div>
        </details>}
        {merged.map((c) => {
          const active = activeCat === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(active ? null : c.key)}
              className={`shrink-0 px-4 py-2.5 ${navigation ? "hidden rounded-xl border-transparent text-base font-semibold hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-sm sm:inline-flex" : "inline-flex rounded-full border text-sm"} items-center gap-2 transition-all duration-200 active:scale-95 ${
                active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white/80 text-neutral-800 border-neutral-200 hover:bg-neutral-100"
              }`}
            >
              {c.image && (
                <ResponsiveImage src={c.image} preset="thumb" sizes="20px" alt="" className="h-5 w-5 rounded-full object-cover" />
              )}
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Dynamic Subcategory Second-Tier Pills Row (reveals if selected parent has active products subcategories) */}
      {!navigation && subcategoriesWithProducts.length > 0 && (
        <div className="w-full flex justify-center border-t border-neutral-100/30 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={() => onSelectSub(null)}
              className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs transition-all shrink-0 border ${
                activeSubCat === null
                  ? "bg-neutral-900 text-white border-neutral-900 shadow-sm font-medium"
                  : "bg-neutral-50 hover:bg-neutral-100 text-neutral-600 border-neutral-200 font-normal"
              }`}
            >
              {t("الكل", "All")}
            </button>
            {subcategoriesWithProducts.map((sub) => {
              const subSlug = sub.slug || sub.name_en;
              const subLabel = lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
              const active = activeSubCat === subSlug;
              const hasSubSubs = categories.some((c) => c.parent_id === sub.id);
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSelectSub(active ? null : subSlug)}
                  className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs transition-all shrink-0 border flex items-center gap-1.5 ${
                    active
                      ? "bg-neutral-900 text-white border-neutral-900 shadow-sm font-medium"
                      : "bg-neutral-50 hover:bg-neutral-100 text-neutral-600 border-neutral-200 font-normal"
                  }`}
                >
                  {subLabel}
                  {hasSubSubs && (
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${active ? "rotate-180" : ""}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dynamic Sub-Subcategory Third-Tier Pills Row (reveals if selected child subcategory has active products subcategories) */}
      {!navigation && subSubcategoriesWithProducts.length > 0 && (
        <div className="w-full flex justify-center border-t border-neutral-100/10 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex flex-wrap gap-1.5 justify-center">
            <button
              type="button"
              onClick={() => onSelectSubSub(null)}
              className={`min-h-[30px] px-3 py-1 rounded-full text-[11px] transition-all shrink-0 border ${
                activeSubSubCat === null
                  ? "bg-neutral-900 text-white border-neutral-900 shadow-xs font-medium"
                  : "bg-neutral-50/50 hover:bg-neutral-100 text-neutral-500 border-neutral-200/60 font-normal"
              }`}
            >
              {t("الكل", "All")}
            </button>
            {subSubcategoriesWithProducts.map((sub) => {
              const subSlug = sub.slug || sub.name_en;
              const subLabel = lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
              const active = activeSubSubCat === subSlug;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSelectSubSub(active ? null : subSlug)}
                  className={`min-h-[30px] px-3 py-1 rounded-full text-[11px] transition-all shrink-0 border ${
                    active
                      ? "bg-neutral-900 text-white border-neutral-900 shadow-xs font-medium"
                      : "bg-neutral-50/50 hover:bg-neutral-100 text-neutral-500 border-neutral-200/60 font-normal"
                  }`}
                >
                  {subLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


