import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import { ProductGrid, type ProductRow } from "@/routes/$slug.index";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { StorefrontPageContent } from "@/routes/$slug.page.$idx";
import { faviconType } from "@/lib/favicon";

export const Route = createFileRoute("/$slug/$category")({
  loader: async ({ params }) => {
    const { data: baseBrand, error: brandError } = await supabase
      .from("brands")
      .select("id, name_en, name_ar, logo_url")
      .eq("slug", params.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (brandError || !baseBrand) return { page: null, brand: null, faviconUrl: null };
    const { data: seoBrand } = await supabase
      .from("brands")
      .select("meta_title, meta_description")
      .eq("id", baseBrand.id)
      .maybeSingle();
    const brand = {
      ...baseBrand,
      meta_title: (seoBrand as any)?.meta_title ?? null,
      meta_description: (seoBrand as any)?.meta_description ?? null,
    };
    const { data: settings } = await supabase
      .from("brand_public_settings")
      .select("pages, logo_url, favicon_url")
      .eq("brand_id", brand.id)
      .maybeSingle();
    const pages = Array.isArray((settings as any)?.pages) ? (settings as any).pages : [];
    const page = pages.find((item: any) => item?.slug === params.category) ?? null;
    return {
      page,
      brand,
      faviconUrl: (settings as any)?.favicon_url || (settings as any)?.logo_url || brand.logo_url || null,
    };
  },
  head: ({ loaderData }) => {
    const page = loaderData?.page as any;
    const brand = loaderData?.brand as any;
    if (!page || !brand) return {};
    const title = page.meta_title || page.title_en || page.title_ar || brand.meta_title || brand.name_en;
    const description = page.meta_description || brand.meta_description || `Learn more about ${brand.name_en}.`;
    const image = page.image_url || brand.logo_url || undefined;
    const favicon = loaderData?.faviconUrl;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(image ? [{ property: "og:image", content: image }] : []),
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(image ? [{ name: "twitter:image", content: image }] : []),
      ],
      links: favicon ? [{ rel: "icon", href: favicon, ...(faviconType(favicon) ? { type: faviconType(favicon) } : {}) }] : [],
    };
  },
  component: CategoryPage,
  notFoundComponent: CategoryUnavailable,
});

function CategoryPage() {
  const { brand, lang, t, settings } = useStorefront();
  const { category: categorySlug } = Route.useParams();
  const cmsPage = settings.pages.find((page) => page.slug === categorySlug);
  const [sort, setSort] = useState<"new" | "old" | "price-low" | "price-high">("new");
  const smartKind = ["new-arrivals", "new"].includes(categorySlug) ? "new" : ["most-selling", "best-sellers", "best-selling"].includes(categorySlug) ? "best" : ["offers", "sale", "discounts"].includes(categorySlug) ? "offers" : null;
  const categoryQuery = useQuery({
    queryKey: ["storefront", brand.slug, "category", categorySlug],
    queryFn: async () => {
      if (smartKind) return { id: smartKind, slug: categorySlug, name_en: smartKind === "new" ? "New arrivals" : smartKind === "best" ? "Most selling" : "Sale", name_ar: smartKind === "new" ? "وصل حديثاً" : smartKind === "best" ? "الأكثر مبيعاً" : "تنزيلات", image_url: null };
      const { data, error } = await (supabase.from("categories") as any).select("id, slug, name_en, name_ar, image_url").eq("brand_id", brand.id).eq("is_active", true).eq("slug", categorySlug).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as { id: string; slug: string; name_en: string; name_ar: string | null; image_url: string | null };
    },
    enabled: !cmsPage,
  });
  const category = categoryQuery.data;
  const productsQuery = useQuery({
    queryKey: ["storefront", brand.slug, "category-products", categorySlug, category?.name_en, smartKind],
    enabled: Boolean(category) && !cmsPage,
    queryFn: async () => {
      if (smartKind === "best") {
        const { data: ranked, error: rankError } = await (supabase.rpc as any)("get_storefront_best_sellers", { p_brand_slug: brand.slug, p_limit: 24 });
        if (rankError) throw rankError;
        const ids = (ranked ?? []).map((row: any) => row.product_id);
        if (!ids.length) return [] as ProductRow[];
        const { data, error } = await supabase.from("products").select("id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, original_price, stock_main, size, color)").eq("brand_id", brand.id).eq("is_active", true).in("id", ids);
        if (error) throw error;
        const order = new Map<string, number>(ids.map((id: string, index: number) => [id, index] as [string, number]));
        return ((data ?? []) as unknown as ProductRow[]).sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
      }
      if (smartKind === "new" || smartKind === "offers") {
        const { data, error } = await supabase.from("products").select("id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, original_price, stock_main, size, color)").eq("brand_id", brand.id).eq("is_active", true).order("created_at", { ascending: false }).limit(smartKind === "new" ? 60 : 200);
        if (error) throw error;
        const rows = (data ?? []) as unknown as ProductRow[];
        return smartKind === "offers" ? rows.filter((product) => product.product_variants.some((variant) => Number(variant.original_price || 0) > Number(variant.selling_price || 0))) : rows;
      }
      const values = [...new Set([category!.slug, category!.name_en].filter(Boolean))];
      const { data, error } = await supabase.from("products").select("id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, original_price, stock_main, size, color)").eq("brand_id", brand.id).eq("is_active", true).in("category", values).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });
  const title = category ? (lang === "ar" ? category.name_ar || category.name_en : category.name_en) : "";
  const sortedProducts = useMemo(() => {
    const rows = [...(productsQuery.data ?? [])];
    if (smartKind === "best" && sort === "new") return rows;
    const price = (product: ProductRow) => Math.min(...product.product_variants.map((variant) => Number(variant.selling_price)).filter((value) => value > 0), Number.MAX_SAFE_INTEGER);
    return rows.sort((a, b) => sort === "old" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : sort === "price-low" ? price(a) - price(b) : sort === "price-high" ? price(b) - price(a) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [productsQuery.data, sort, smartKind]);
  const BackIcon = lang === "ar" ? ChevronRight : ChevronLeft;
  if (cmsPage) return <StorefrontPageContent page={cmsPage} />;
  return <main>
    <section className="border-b" style={{ backgroundColor: "var(--sf-header-bg)", color: "var(--sf-header-fg)" }}><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/$slug" params={{ slug: brand.slug }} className="mb-5 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"><BackIcon className="h-4 w-4" />{t("العودة للمتجر", "Back to store")}</Link>
      <div className="flex items-center gap-5">{category?.image_url && <img src={category.image_url} alt="" className="h-20 w-20 rounded-2xl object-cover sm:h-28 sm:w-28" />}<div><p className="text-xs uppercase tracking-[0.2em] opacity-60">{t("القسم", "Category")}</p><h1 className="mt-1 font-display text-3xl sm:text-5xl" style={{ color: "var(--sf-heading)" }}>{title}</h1></div></div>
    </div></section>
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><div className="mb-6 flex justify-end"><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-11 rounded-lg border bg-background px-3 text-sm"><option value="new">{t("الأحدث أولاً", "Newest first")}</option><option value="old">{t("الأقدم أولاً", "Oldest first")}</option><option value="price-low">{t("السعر: الأقل أولاً", "Price: low to high")}</option><option value="price-high">{t("السعر: الأعلى أولاً", "Price: high to low")}</option></select></div><ProductGrid products={sortedProducts} loading={categoryQuery.isLoading || productsQuery.isLoading} categoryEmpty onViewAll={() => { window.location.href = `/${brand.slug}`; }} /></section>
  </main>;
}

function CategoryUnavailable() {
  const { brand, t } = useStorefront();
  return <div className="mx-auto max-w-3xl px-4 py-20 text-center"><h1 className="text-3xl font-display">{t("القسم غير متاح", "Category unavailable")}</h1><Link to="/$slug" params={{ slug: brand.slug }} className="mt-5 inline-block underline">{t("العودة للمتجر", "Back to store")}</Link></div>;
}
