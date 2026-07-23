import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { ResponsiveImage } from "@/components/responsive-media";
import { ProductGrid } from "@/components/storefront/product-grid";

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

export function SearchPage() {
  const { brand, currency, lang, t } = useStorefront();
  const search = Route.useSearch();
  const term = String(search.q || "").trim();
  const [sort, setSort] = useState<"new" | "price-low" | "price-high">("new");

  const { data, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "search", term],
    queryFn: async () => {
      if (!term) return [];
      const { data: rows, error } = await supabase
        .from("products")
        .select(`
          id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at,
          product_variants ( id, selling_price, original_price, stock_main )
        `)
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .or(`name.ilike.%${term}%,name_ar.ilike.%${term}%,name_en.ilike.%${term}%,description.ilike.%${term}%,description_ar.ilike.%${term}%,description_en.ilike.%${term}%,category.ilike.%${term}%`);
      if (error) throw error;
      return (rows ?? []) as unknown as ProductRow[];
    },
    enabled: Boolean(term),
  });

  useEffect(() => {
    if (term) {
      trackStorefrontEvent("search", { query: term });
    }
  }, [term]);

  const results = useMemo(() => {
    const rows = data ?? [];
    if (sort === "new") return rows;
    const price = (product: ProductRow) => Number(product.product_variants?.[0]?.selling_price ?? Number.MAX_SAFE_INTEGER);
    return rows.sort((a, b) => sort === "price-low" ? price(a) - price(b) : sort === "price-high" ? price(b) - price(a) : 0);
  }, [data, sort]);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12 text-start">
      <h1 className="font-display text-2xl sm:text-3xl mb-2" style={{ color: "var(--sf-heading)" }}>
        {t("نتائج البحث", "Search results")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {term ? t(`عن "${term}"`, `for "${term}"`) : t("اكتب كلمة للبحث", "Type a search term")}
      </p>
      <div className="mb-6 flex justify-end">
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="new">{t("الأحدث", "Newest")}</option>
          <option value="price-low">{t("السعر: الأقل أولاً", "Price: low to high")}</option>
          <option value="price-high">{t("السعر: الأعلى أولاً", "Price: high to low")}</option>
        </select>
      </div>

      {term ? (
        <ProductGrid
          products={results as any[]}
          loading={isLoading}
          categoryEmpty={false}
          onViewAll={() => {}}
        />
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          {t("اكتب كلمة للبحث", "Type a search term")}
        </Card>
      )}
    </section>
  );
}
