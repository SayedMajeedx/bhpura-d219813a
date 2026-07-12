import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import { ProductGrid, type ProductRow } from "./$slug.index";

export const Route = createFileRoute("/$slug/wishlist")({ component: WishlistPage });

function WishlistPage() {
  const { brand, wishlist, t } = useStorefront();
  const { data = [], isLoading } = useQuery({
    queryKey: ["storefront", brand.slug, "wishlist", wishlist],
    queryFn: async () => {
      if (!wishlist.length) return [];
      const { data, error } = await supabase.from("products").select("id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, product_variants(id, selling_price, original_price, stock_main, size, color)").eq("brand_id", brand.id).eq("is_active", true).in("id", wishlist);
      if (error) throw error;
      const order = new Map(wishlist.map((id, index) => [id, index]));
      return ((data ?? []) as unknown as ProductRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
    enabled: wishlist.length > 0,
  });
  return <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <div className="mb-8 flex items-center gap-3"><Heart className="h-7 w-7" /><div><h1 className="font-display text-3xl">{t("المفضلة", "Wishlist")}</h1><p className="text-sm text-muted-foreground">{t("المنتجات التي حفظتها للعودة إليها لاحقاً.", "Products you saved for later.")}</p></div></div>
    <ProductGrid products={data} loading={isLoading} categoryEmpty={false} onViewAll={() => undefined} />
  </main>;
}
