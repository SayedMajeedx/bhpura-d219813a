import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import { ProductGrid, type ProductRow } from "@/routes/$slug.index";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/$slug/$category")({
  component: CategoryPage,
  notFoundComponent: CategoryUnavailable,
});

function CategoryPage() {
  const { brand, lang, t } = useStorefront();
  const { category: categorySlug } = Route.useParams();
  const categoryQuery = useQuery({
    queryKey: ["storefront", brand.slug, "category", categorySlug],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any).select("id, slug, name_en, name_ar, image_url").eq("brand_id", brand.id).eq("is_active", true).eq("slug", categorySlug).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as { id: string; slug: string; name_en: string; name_ar: string | null; image_url: string | null };
    },
  });
  const category = categoryQuery.data;
  const productsQuery = useQuery({
    queryKey: ["storefront", brand.slug, "category-products", categorySlug, category?.name_en],
    enabled: Boolean(category),
    queryFn: async () => {
      const values = [...new Set([category!.slug, category!.name_en].filter(Boolean))];
      const { data, error } = await supabase.from("products").select("id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, stock_main, size, color)").eq("brand_id", brand.id).eq("is_active", true).in("category", values).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });
  const title = category ? (lang === "ar" ? category.name_ar || category.name_en : category.name_en) : "";
  const BackIcon = lang === "ar" ? ChevronRight : ChevronLeft;
  return <main>
    <section className="border-b" style={{ backgroundColor: "var(--sf-header-bg)", color: "var(--sf-header-fg)" }}><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/$slug" params={{ slug: brand.slug }} className="mb-5 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"><BackIcon className="h-4 w-4" />{t("العودة للمتجر", "Back to store")}</Link>
      <div className="flex items-center gap-5">{category?.image_url && <img src={category.image_url} alt="" className="h-20 w-20 rounded-2xl object-cover sm:h-28 sm:w-28" />}<div><p className="text-xs uppercase tracking-[0.2em] opacity-60">{t("القسم", "Category")}</p><h1 className="mt-1 font-display text-3xl sm:text-5xl" style={{ color: "var(--sf-heading)" }}>{title}</h1></div></div>
    </div></section>
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><ProductGrid products={productsQuery.data ?? []} loading={categoryQuery.isLoading || productsQuery.isLoading} categoryEmpty onViewAll={() => { window.location.href = `/${brand.slug}`; }} /></section>
  </main>;
}

function CategoryUnavailable() {
  const { brand, t } = useStorefront();
  return <div className="mx-auto max-w-3xl px-4 py-20 text-center"><h1 className="text-3xl font-display">{t("القسم غير متاح", "Category unavailable")}</h1><Link to="/$slug" params={{ slug: brand.slug }} className="mt-5 inline-block underline">{t("العودة للمتجر", "Back to store")}</Link></div>;
}
