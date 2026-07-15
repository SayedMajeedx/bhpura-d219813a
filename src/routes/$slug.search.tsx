import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { ResponsiveImage } from "@/components/responsive-media";

type SearchParams = { q: string };

type ProductRow = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  category: string | null;
  image_url: string | null;
  media: Array<{ type: "image" | "video"; url: string }> | null;
  product_variants: Array<{ id: string; selling_price: number; original_price: number | null; stock_main: number }>;
};

export const Route = createFileRoute("/$slug/search")({
  validateSearch: (s): SearchParams => ({ q: typeof s.q === "string" ? s.q : "" }),
  component: SearchPage,
});

function SearchPage() {
  const { brand, lang, t, currency } = useStorefront();
  const { q } = Route.useSearch();
  const term = q.trim();
  const [sort, setSort] = useState<"new" | "price-low" | "price-high">("new");
  useEffect(() => { if (term) trackStorefrontEvent("search", { search_string: term }, term.toLowerCase()); }, [term]);

  const { data, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "search", term],
    enabled: term.length > 0,
    queryFn: async () => {
      const pattern = `%${term.replace(/[%_]/g, (m: string) => `\\${m}`)}%`;
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, product_variants(id, selling_price, original_price, stock_main)")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .or(`name.ilike.${pattern},name_ar.ilike.${pattern},name_en.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
    staleTime: 15_000,
  });

  const results = useMemo(() => {
    const rows = [...(data ?? [])];
    const price = (product: ProductRow) => Number(product.product_variants?.[0]?.selling_price ?? Number.MAX_SAFE_INTEGER);
    return rows.sort((a, b) => sort === "price-low" ? price(a) - price(b) : sort === "price-high" ? price(b) - price(a) : 0);
  }, [data, sort]);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="font-display text-2xl sm:text-3xl mb-2" style={{ color: "var(--sf-heading)" }}>
        {t("نتائج البحث", "Search results")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {term ? t(`عن "${term}"`, `for "${term}"`) : t("اكتب كلمة للبحث", "Type a search term")}
      </p>
      <div className="mb-6 flex justify-end"><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="new">{t("الأحدث", "Newest")}</option><option value="price-low">{t("السعر: الأقل أولاً", "Price: low to high")}</option><option value="price-high">{t("السعر: الأعلى أولاً", "Price: high to low")}</option></select></div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      )}

      {!isLoading && term && results.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          {t("لا توجد منتجات مطابقة", "No matching products found")}
        </Card>
      )}

      {!isLoading && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {results.map((p) => {
            const displayName = pickName(lang, p);
            const price = p.product_variants?.[0]?.selling_price ?? 0;
            const oldPrice = Number(p.product_variants?.[0]?.original_price ?? 0);
            const imageUrl = p.image_url || p.media?.find((item) => item.type === "image")?.url || null;
            return (
              <Link
                key={p.id}
                to="/$slug/product/$id"
                params={{ slug: brand.slug, id: p.id }}
                className="group block"
              >
                <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted">
                  {imageUrl ? (
                    <ResponsiveImage src={imageUrl} preset="card" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" alt={displayName} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : null}
                </div>
                <div className="mt-2">
                  <div className="text-sm font-medium truncate">{displayName}</div>
                  <div className="flex items-baseline gap-2 text-sm" style={{ color: "var(--sf-heading)" }}>
                    <span>{formatPrice(Number(price), currency, lang)}</span>{oldPrice > Number(price) && <span className="text-xs text-muted-foreground line-through">{formatPrice(oldPrice, currency, lang)}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
