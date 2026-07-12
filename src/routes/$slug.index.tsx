import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useEffect, useRef } from "react";
import { StorefrontMenu } from "@/routes/$slug.route";

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
  product_variants: Array<{
    id: string;
    selling_price: number;
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
          "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, stock_main, size, color)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
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
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = products ?? [];
    if (!activeCat) return list;
    return list.filter((p) => p.category === activeCat);
  }, [products, activeCat]);

  const { data: bestSellerRows } = useQuery({
    queryKey: ["storefront", brand.slug, "best-sellers"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_storefront_best_sellers", { p_brand_slug: brand.slug, p_limit: 8 });
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string; units_sold: number }>;
    },
    staleTime: 60_000,
  });

  const newest = (products ?? []).slice(0, 8);
  const bestIds = new Map((bestSellerRows ?? []).map((row, index) => [row.product_id, index]));
  const bestSellers = (products ?? []).filter((product) => bestIds.has(product.id)).sort((a, b) => (bestIds.get(a.id) ?? 99) - (bestIds.get(b.id) ?? 99));

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6"><Categories products={products ?? []} categories={categories ?? []} activeCat={activeCat} onSelect={setActiveCat} navigation /></div>
      <HeroBanner />
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
        <PromoCards />
        {!activeCat && <>
          <MerchandisingSection kind="new" products={newest} />
          <MerchandisingSection kind="best" products={bestSellers} />
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
      return <a key={index} href={card.href || "#products"} className="group relative aspect-[16/9] overflow-hidden rounded-2xl border shadow-sm sm:aspect-[2/1]" style={{ backgroundColor: card.background_color || "#f4f4f4", color: card.text_color || "#111111" }}>
        {card.image_url && <img src={card.image_url} alt={title || ""} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-6"><h3 className="text-2xl font-semibold sm:text-3xl">{title}</h3>{subtitle && <p className="mt-1 max-w-md text-sm opacity-90">{subtitle}</p>}</div>
      </a>;
    })}
  </div>;
}

function SectionHeading({ title, fallbackAr, fallbackEn }: { title?: string | null; fallbackAr: string; fallbackEn: string }) {
  const { lang } = useStorefront();
  return <div className="mb-5 flex items-end justify-between"><h2 className="font-display text-2xl sm:text-3xl" style={{ color: "var(--sf-heading)" }}>{title || (lang === "ar" ? fallbackAr : fallbackEn)}</h2><div className="h-px flex-1 bg-border ms-5" /></div>;
}

function MerchandisingSection({ kind, products }: { kind: "new" | "best"; products: ProductRow[] }) {
  const { settings, lang } = useStorefront();
  if (kind === "new" && !settings.show_new_arrivals) return null;
  if (kind === "best" && (!settings.show_best_sellers || !products.length)) return null;
  const title = kind === "new"
    ? (lang === "ar" ? settings.new_arrivals_title_ar : settings.new_arrivals_title_en)
    : (lang === "ar" ? settings.best_sellers_title_ar : settings.best_sellers_title_en);
  return <section className="mb-12"><SectionHeading title={title} fallbackAr={kind === "new" ? "وصل حديثاً" : "الأكثر مبيعاً"} fallbackEn={kind === "new" ? "New arrivals" : "Best sellers"} /><div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 sm:gap-6">{products.map((product) => <ProductCard key={`${kind}-${product.id}`} product={product} />)}</div></section>;
}

function HeroBanner() {
  const { brand, settings, t, lang } = useStorefront();
  const media = brand.hero_media && brand.hero_media.length > 0 ? brand.hero_media : null;

  return (
    <section className="relative w-full overflow-hidden min-h-[300px] sm:min-h-[55vh] sm:max-h-[640px]">
      {media ? (
        <HeroCarousel items={media} />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${settings.primary_color}22, ${settings.primary_color}66)`,
          }}
        />
      )}

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 h-full flex items-center min-h-[300px] sm:min-h-[55vh]">
        <div className="max-w-xl w-full bg-white/85 backdrop-blur rounded-2xl p-6 sm:p-8 shadow-lg" style={{ textAlign: settings.hero_title_align }}>
          {settings.show_hero_title && <h1
              className="mb-3 leading-tight"
              style={{ color: settings.hero_title_color ?? "var(--sf-heading)", fontSize: `clamp(1.875rem, 5vw, ${settings.hero_title_size}px)`, fontFamily: "var(--sf-font)" }}
          >
              {lang === "ar"
                ? settings.hero_title_ar || brand.name_ar || brand.name_en
                : settings.hero_title_en || brand.name_en}
          </h1>}
          {settings.show_hero_about && <p className="text-sm sm:text-base text-neutral-700 mb-4">
            {(lang === "ar" ? brand.about_ar : brand.about_en) ||
              t("مجموعة مختارة بعناية لك.", "A curated collection made for you.")}
          </p>}
          <a
            href="#products"
            className="inline-flex items-center px-6 py-3 rounded-full font-semibold"
            style={{ backgroundColor: "var(--sf-btn-primary-bg)", color: "var(--sf-btn-primary-fg)" }}
          >
            {t("تسوّق الآن", "Shop now")}
          </a>
        </div>
      </div>
    </section>
  );
}

function HeroCarousel({ items }: { items: Array<{ type: "image" | "video"; url: string }> }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (items.length <= 1 || items[idx]?.type === "video") return;
    timer.current = window.setTimeout(() => setIdx((i) => (i + 1) % items.length), 6000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [idx, items]);

  return (
    <div className="absolute inset-0">
      {items.map((m, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === idx ? 1 : 0 }}
        >
          {m.type === "video" ? (
            <video
              src={m.url}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img src={m.url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
      ))}
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
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
  const { t, lang, brand } = useStorefront();

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
    <div className={`${navigation ? "my-2 min-h-16 items-center justify-center overflow-x-auto border-b py-2" : "mb-8 justify-center"} flex flex-nowrap gap-3`}>
      {navigation && <StorefrontMenu navigation />}
      {merged.map((c) => {
        const active = activeCat === c.key;
        return (
          <Link
            key={c.key}
            to="/$slug/$category"
            params={{ slug: brand.slug, category: c.key }}
            className={`shrink-0 px-4 py-2.5 ${navigation ? "rounded-xl border-transparent text-base font-semibold hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-sm" : "rounded-full border text-sm"} inline-flex items-center gap-2 transition-all duration-200 active:scale-95 ${
              active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white/80 text-neutral-800 border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            {c.image && (
              <img src={c.image} alt="" className="h-5 w-5 rounded-full object-cover" />
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

export function ProductCard({ product }: { product: ProductRow }) {
  const { brand, currency, lang, t } = useStorefront();
  const displayName = pickName(lang, product);
  const prices = product.product_variants.map((v) => v.selling_price).filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const totalStock = product.product_variants.reduce((s, v) => s + (v.stock_main || 0), 0);
  const oos = totalStock <= 0;

  const media = Array.isArray(product.media)
    ? (product.media as Array<{ type: string; url: string }>)
    : [];
  const cover = media.find((m) => m.type === "image")?.url || product.image_url;

  return (
    <Link
      to="/$slug/product/$id"
      params={{ slug: brand.slug, id: product.id }}
      className="group block"
    >
      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted relative">
        {cover ? (
          <img
            src={cover}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
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
        <div className="text-sm font-semibold" style={{ color: "var(--sf-heading)" }}>
          {minPrice > 0 ? formatPrice(minPrice, currency, lang) : t("السعر عند الطلب", "Price on request")}
        </div>
      </div>
    </Link>
  );
}
