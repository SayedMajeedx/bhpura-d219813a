import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SearchParams = { q: string };

type ProductRow = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  product_variants: Array<{ id: string; selling_price: number; stock_main: number }>;
};

export const Route = createFileRoute("/$slug/search")({
  validateSearch: (s): SearchParams => ({ q: typeof s.q === "string" ? s.q : "" }),
  component: SearchPage,
});

function SearchPage() {
  const { brand, lang, t, currency } = useStorefront();
  const { q } = Route.useSearch();
  const term = q.trim();

  const { data, isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "search", term],
    enabled: term.length > 0,
    queryFn: async () => {
      const pattern = `%${term.replace(/[%_]/g, (m: string) => `\\${m}`)}%`;
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, name_en, description, description_ar, description_en, image_url, product_variants(id, selling_price, stock_main)")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .or(`name.ilike.${pattern},name_ar.ilike.${pattern},name_en.ilike.${pattern},description.ilike.${pattern},description_ar.ilike.${pattern},description_en.ilike.${pattern}`)
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
    staleTime: 15_000,
  });

  const results = data ?? [];

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="font-display text-2xl sm:text-3xl mb-2" style={{ color: "var(--sf-heading)" }}>
        {t("نتائج البحث", "Search results")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {term ? t(`عن "${term}"`, `for "${term}"`) : t("اكتب كلمة للبحث", "Type a search term")}
      </p>

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
            return (
              <Link
                key={p.id}
                to="/$slug/product/$id"
                params={{ slug: brand.slug, id: p.id }}
                className="group block"
              >
                <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt={displayName} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : null}
                </div>
                <div className="mt-2">
                  <div className="text-sm font-medium truncate">{displayName}</div>
                  <div className="text-sm" style={{ color: "var(--sf-heading)" }}>
                    {formatPrice(Number(price), currency, lang)}
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
