import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useEffect, useRef, type AnchorHTMLAttributes } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Grid2X2, Heart } from "lucide-react";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";

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
  sort_order: number;
};

function StoreHome() {
  const { brand } = useStorefront();
  const [activeCat, setActiveCat] = useState<string | null>(null);

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
        .select("id, name_en, name_ar, slug, image_url, sort_order")
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

  const filtered = useMemo(() => {
    const list = products ?? [];
    return activeCat ? list.filter((p) => p.category === activeCat) : list;
  }, [products, activeCat]);

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

  const newest = (products ?? []).slice(0, 8);
  const bestIds = new Map((bestSellerRows ?? []).map((row, index) => [row.product_id, index]));
  const bestSellers = (products ?? []).filter((product) => bestIds.has(product.id)).sort((a, b) => (bestIds.get(a.id) ?? 99) - (bestIds.get(b.id) ?? 99));
  const saleProducts = (products ?? []).filter((product) => product.product_variants.some((variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0))).slice(0, 8);
  const { data: trendingRows } = useQuery({
    queryKey: ["storefront", brand.slug, "trending"],
    queryFn: async () => { const { data, error } = await (supabase.rpc as any)("get_storefront_trending", { p_brand_slug: brand.slug, p_limit: 8 }); if (error) throw error; return data ?? []; },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
  const trendingIds = new Map((trendingRows ?? []).map((row: any, index: number) => [row.product_id, index]));
  const trending = (products ?? []).filter((product) => trendingIds.has(product.id)).sort((a, b) => (trendingIds.get(a.id) ?? 99) - (trendingIds.get(b.id) ?? 99));

  return (
    <div>
      <HeroBanner />
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
        <PromoCards />
        {!activeCat && <>
          <MerchandisingSection kind="new" products={newest} />
          <MerchandisingSection kind="best" products={bestSellers} />
          <MerchandisingSection kind="sale" products={saleProducts} />
          <MerchandisingSection kind="trending" products={trending} bestSellerIds={new Set(bestIds.keys())} />
        </>}
        <SectionHeading title={activeCat ? undefined : null} fallbackAr="كل المنتجات" fallbackEn="All products" />
        <ProductGrid
          products={filtered}
          loading={isLoading}
          categoryEmpty={activeCat !== null}
          onViewAll={() => setActiveCat(null)}
        />
      </section>
    </div>
  );
}

function PromoCards() {
  const { settings, lang } = useStorefront();
  const cards = settings.home_promo_cards.filter((card) => card && (card.image_url || card.title_en || card.title_ar));
  if (!cards.length) return null;
  return <div className="mb-12 grid grid-cols-1 gap-3 sm:grid-cols-2">
    {cards.map((card, index) => {
      const title = lang === "ar" ? card.title_ar || card.title_en : card.title_en || card.title_ar;
      const subtitle = lang === "ar" ? card.subtitle_ar || card.subtitle_en : card.subtitle_en || card.subtitle_ar;
      return <StorefrontLink key={index} href={card.href || "#products"} className="group relative aspect-[16/9] overflow-hidden rounded-2xl border shadow-sm sm:aspect-[2/1]" style={{ backgroundColor: card.background_color || "#f4f4f4", color: card.text_color || "#111111" }}>
        {card.image_url && <ResponsiveImage src={card.image_url} preset="content" sizes="(min-width: 640px) 50vw, 100vw" alt={title || ""} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-6"><h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>{subtitle && <p className="mt-1 max-w-md text-sm opacity-90">{subtitle}</p>}</div>
      </StorefrontLink>;
    })}
  </div>;
}

function SectionHeading({ title, fallbackAr, fallbackEn }: { title?: string | null; fallbackAr: string; fallbackEn: string }) {
  const { lang } = useStorefront();
  return <div className="mb-5 flex items-end justify-between"><h2 className="font-display text-2xl sm:text-3xl" style={{ color: "var(--sf-heading)" }}>{title || (lang === "ar" ? fallbackAr : fallbackEn)}</h2><div className="h-px flex-1 bg-border ms-5" /></div>;
}

function MerchandisingSection({ kind, products, bestSellerIds = new Set<string>() }: { kind: "new" | "best" | "sale" | "trending"; products: ProductRow[]; bestSellerIds?: Set<string> }) {
  const { settings, lang } = useStorefront();
  if (kind === "new" && !settings.show_new_arrivals) return null;
  if (kind === "best" && (!settings.show_best_sellers || !products.length)) return null;
  if ((kind === "sale" || kind === "trending") && !products.length) return null;
  const title = kind === "new"
    ? (lang === "ar" ? settings.new_arrivals_title_ar : settings.new_arrivals_title_en)
    : kind === "best" ? (lang === "ar" ? settings.best_sellers_title_ar : settings.best_sellers_title_en) : null;
  const label = kind === "new" ? ["وصل حديثاً", "New arrivals"] : kind === "best" ? ["الأكثر مبيعاً", "Best sellers"] : kind === "sale" ? ["تنزيلات", "Sale"] : ["الرائج الآن", "Trending now"];
  return <section className="mb-12"><SectionHeading title={title} fallbackAr={label[0]} fallbackEn={label[1]} /><div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 sm:gap-6">{products.map((product) => <ProductCard key={`${kind}-${product.id}`} product={product} badge={kind === "trending" ? (bestSellerIds.has(product.id) ? "best" : "trending") : kind === "best" ? "best" : undefined} />)}</div></section>;
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
    <section className="relative w-full overflow-hidden py-6 sm:min-h-[55vh] sm:max-h-[640px] sm:py-0">
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

      <div className="relative z-10 mx-auto flex max-w-7xl items-center px-4 sm:min-h-[55vh] sm:px-6">
        <HeroContentCarousel slides={slides} />
      </div>
    </section>
  );
}

function HeroContentCarousel({ slides }: { slides: import("@/lib/storefront-context").HeroContentSlide[] }) {
  const { settings, lang } = useStorefront();
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);

  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
  }, []);

  const goTo = (next: number) => {
    const safe = (next + slides.length) % slides.length;
    setIdx(safe);
    scroller.current?.scrollTo({ left: safe * scroller.current.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="relative isolate w-[88%] max-w-xl overflow-hidden rounded-2xl bg-transparent shadow-lg [clip-path:inset(0_round_1rem)] [transform:translateZ(0)] sm:w-full">
      <div ref={scroller} dir="ltr" className="flex items-stretch snap-x snap-mandatory scroll-smooth overflow-x-auto overflow-y-hidden rounded-2xl overscroll-x-contain [clip-path:inset(0_round_1rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onScroll={(event) => {
        const element = event.currentTarget;
        if (scrollFrame.current !== null) return;
        scrollFrame.current = requestAnimationFrame(() => {
          scrollFrame.current = null;
          const width = element.clientWidth;
          if (!width) return;
          const nextIndex = Math.round(element.scrollLeft / width);
          setIdx((current) => current === nextIndex ? current : nextIndex);
        });
      }}>
        {slides.map((slide, slideIndex) => {
          const title = lang === "ar" ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar;
          const body = lang === "ar" ? slide.body_ar || slide.body_en : slide.body_en || slide.body_ar;
          const button = lang === "ar" ? slide.button_ar || slide.button_en : slide.button_en || slide.button_ar;
          const mediaUrl = (lang === "ar" ? slide.media_url_ar : slide.media_url_en) || slide.media_url || (lang === "ar" ? slide.media_url_en : slide.media_url_ar) || "";
          const streamIframeUrl = (lang === "ar" ? slide.media_iframe_url_ar : slide.media_iframe_url_en) || (lang === "ar" ? slide.media_iframe_url_en : slide.media_iframe_url_ar) || "";
          const posterUrl = (lang === "ar" ? slide.media_poster_url_ar : slide.media_poster_url_en) || (lang === "ar" ? slide.media_poster_url_en : slide.media_poster_url_ar) || mediaUrl;
          return <article key={slide.id} dir={lang === "ar" ? "rtl" : "ltr"} className={`aspect-video min-w-full snap-center snap-always overflow-hidden rounded-2xl transition-[opacity,transform] duration-500 ease-out [clip-path:inset(0_round_1rem)] sm:aspect-auto ${slideIndex === idx ? "scale-100 opacity-100" : "scale-[0.985] opacity-80"}`}>
            {slide.type === "image" && mediaUrl ? <StorefrontLink href={slide.button_href || "#products"} className="block h-full w-full overflow-hidden rounded-2xl sm:h-[320px]"><ResponsiveImage src={mediaUrl} preset="hero" sizes="100vw" alt={title || ""} className="h-full w-full object-cover" fetchPriority={slideIndex === 0 ? "high" : "auto"} loading={slideIndex === 0 ? "eager" : "lazy"} /></StorefrontLink> : slide.type === "video" && (mediaUrl || streamIframeUrl) ? <StorefrontLink href={slide.button_href || "#products"} className="block h-full w-full cursor-pointer overflow-hidden rounded-2xl sm:h-[320px]" aria-label={title || (lang === "ar" ? "فتح الرابط" : "Open link")}><OptimizedVideo src={streamIframeUrl ? undefined : mediaUrl} streamIframeUrl={streamIframeUrl} poster={posterUrl} active={slideIndex === idx} className="pointer-events-none h-full w-full object-contain sm:object-cover" wrapperClassName="pointer-events-none h-full w-full overflow-hidden" /></StorefrontLink> : <div className="flex h-full flex-col justify-center overflow-hidden rounded-2xl bg-white/85 px-4 pb-11 pt-3 backdrop-blur sm:h-[320px] sm:p-8 sm:pb-20" style={{ textAlign: settings.hero_title_align }}>
              {settings.show_hero_title && title && <h1 className="mb-1 leading-tight sm:mb-3" style={{ color: settings.hero_title_color ?? "var(--sf-heading)", fontSize: `clamp(1.25rem, 5vw, ${settings.hero_title_size}px)`, fontFamily: "var(--sf-font)" }}>{title}</h1>}
              {settings.show_hero_about && body && <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-neutral-700 sm:mb-4 sm:line-clamp-none sm:text-base">{body}</p>}
              {button && <div><StorefrontLink href={slide.button_href || "#products"} className="inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold sm:px-6 sm:py-3 sm:text-base" style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)" }}>{button}</StorefrontLink></div>}
            </div>}
          </article>;
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
  const internalAbsolute = /^https?:\/\/(?:www\.)?(?:boutq\.store|bhpura\.vercel\.app)(?:\/|$)/i.test(value);
  const destination = internalAbsolute ? value.replace(/^https?:\/\/[^/]+/i, "") || "/" : value;
  const external = /^(?:https?:)?\/\//i.test(destination) || /^(?:mailto|tel):/i.test(destination);
  if (external || destination.startsWith("#")) return <a href={destination} {...props} />;
  return <Link to={destination as any} preload="intent" {...(props as any)} />;
}

function Categories({
  products,
  categories,
  activeCat,
  onSelect,
  navigation = false,
}: {
  products: ProductRow[];
  categories: CategoryRow[];
  activeCat: string | null;
  onSelect: (c: string | null) => void;
  navigation?: boolean;
}) {
  const { t, lang, brand, settings } = useStorefront();
  const menuBackground = settings.menu_bg || settings.background_color || "#ffffff";
  const menuText = settings.menu_fg || settings.text_color || "#111111";

  // Merge admin-defined categories with any legacy categories referenced by products
  const merged = useMemo(() => {
    const known = new Map<string, { key: string; label: string; image: string | null }>();
    for (const c of categories) {
      const key = c.slug || c.name_en;
      const label = (lang === "ar" ? c.name_ar : c.name_en) || c.name_en;
      known.set(key, { key, label, image: c.image_url });
    }
    for (const p of products) {
      if (p.category && !known.has(p.category)) {
        known.set(p.category, { key: p.category, label: p.category, image: null });
      }
    }
    return Array.from(known.values());
  }, [categories, products, lang]);

  if (merged.length === 0) return null;

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className={`${navigation ? "my-2 min-h-16 w-full items-center justify-start border-b py-2 sm:justify-center" : "mb-8 justify-center"} flex flex-wrap gap-3`}>
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
          <Link
            key={c.key}
            to="/$slug/$category"
            params={{ slug: brand.slug, category: c.key }}
            className={`shrink-0 px-4 py-2.5 ${navigation ? "hidden rounded-xl border-transparent text-base font-semibold hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-sm sm:inline-flex" : "inline-flex rounded-full border text-sm"} items-center gap-2 transition-all duration-200 active:scale-95 ${
              active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white/80 text-neutral-800 border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            {c.image && (
              <ResponsiveImage src={c.image} preset="thumb" sizes="20px" alt="" className="h-5 w-5 rounded-full object-cover" />
            )}
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}

export function ProductGrid({ products, loading, categoryEmpty, onViewAll }: { products: ProductRow[]; loading: boolean; categoryEmpty: boolean; onViewAll: () => void }) {
  const { t } = useStorefront();
  if (loading) {
    return (
      <div id="products" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[3/4] rounded-xl w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <Card id="products" className="p-8 sm:p-12 text-center text-muted-foreground">
        <p>{categoryEmpty
          ? t("لا توجد منتجات متاحة في هذا القسم حالياً.", "No products are currently available in this category.")
          : t("لا توجد منتجات بعد.", "No products yet.")}</p>
        {categoryEmpty && (
          <button type="button" onClick={onViewAll} className="mt-4 text-sm font-medium underline underline-offset-4" style={{ color: "var(--sf-link)" }}>
            {t("عرض كل المنتجات", "View all products")}
          </button>
        )}
      </Card>
    );
  }

  return (
    <div id="products" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function ProductCard({ product, badge }: { product: ProductRow; badge?: "trending" | "best" }) {
  const { brand, currency, lang, t, isWishlisted, toggleWishlist, settings } = useStorefront();
  const displayName = pickName(lang, product);
  const pricedVariants = product.product_variants.filter((variant) => Number(variant.selling_price || 0) > 0).sort((a, b) => a.selling_price - b.selling_price);
  const discountedVariant = pricedVariants.filter((variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0))[0];
  const displayVariant = discountedVariant ?? pricedVariants[0];
  const minPrice = Number(displayVariant?.selling_price || 0);
  const originalPrice = discountedVariant ? Number(discountedVariant.original_price) : 0;
  const discountPercent = discountedVariant ? Math.round((1 - discountedVariant.selling_price / originalPrice) * 100) : 0;
  const totalStock = product.product_variants.reduce((s, v) => s + (v.stock_main || 0), 0);
  const oos = totalStock <= 0;

  const media = Array.isArray(product.media)
    ? (product.media as Array<{ type: string; url: string }>)
    : [];
  const cover = media.find((m) => m.type === "image")?.url || product.image_url;

  const wished = isWishlisted(product.id);
  return (
    <div className="group relative">
      <button type="button" onClick={() => toggleWishlist(product.id)} aria-label={wished ? t("إزالة من المفضلة", "Remove from wishlist") : t("إضافة إلى المفضلة", "Add to wishlist")} className="absolute end-2 top-2 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/95 text-neutral-900 shadow-md transition hover:scale-105">
        <Heart className={`h-5 w-5 ${wished ? "fill-red-600 text-red-600" : ""}`} />
      </button>
      <Link to="/$slug/product/$id" params={{ slug: brand.slug, id: product.id }} preload="intent" className="block" onClick={() => { void (supabase.rpc as any)("record_storefront_product_engagement", { p_brand_slug: brand.slug, p_product_id: product.id, p_event: "click" }); }}>
      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted relative">
        {discountPercent > 0 && settings.global_sale_badges_enabled && product.show_sale_badge !== false && <span className="absolute start-0 top-0 z-10 rounded-ee-2xl bg-red-600 px-4 py-2 text-xs font-semibold text-white">{t(`وفر ${discountPercent}%`, `Sale ${discountPercent}% off`)}</span>}
        {badge && !(discountPercent > 0 && settings.global_sale_badges_enabled && product.show_sale_badge !== false) && <span className={`absolute start-0 top-0 z-10 rounded-ee-2xl px-4 py-2 text-xs font-semibold text-white ${badge === "best" ? "bg-amber-600" : "bg-neutral-950"}`}>{badge === "best" ? t("الأكثر مبيعاً", "Best Seller") : t("رائج", "Trending")}</span>}
        {cover ? (
          <ResponsiveImage
            src={cover}
            preset="card"
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
      <div className="mt-2">
        <div className="text-sm font-medium truncate">{displayName}</div>
        <div className="flex flex-wrap items-baseline gap-2 text-sm font-semibold" style={{ color: "var(--sf-heading)" }}>
          <span>{minPrice > 0 ? formatPrice(minPrice, currency, lang) : t("السعر عند الطلب", "Price on request")}</span>
          {originalPrice > minPrice && <span className="text-xs font-normal text-muted-foreground line-through">{formatPrice(originalPrice, currency, lang)}</span>}
        </div>
      </div>
      </Link>
    </div>
  );
}
