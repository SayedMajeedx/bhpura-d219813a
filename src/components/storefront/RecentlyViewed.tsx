import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import { ProductCard } from "@/components/storefront/product-card";
import { type ProductRow } from "@/routes/$slug.index";
import { Clock } from "lucide-react";

const STORAGE_PREFIX = "boutq_rv_";
const MAX_RECENT_ITEMS = 12;

export function recordRecentlyViewed(brandSlug: string, productId: string) {
  if (typeof window === "undefined" || !brandSlug || !productId) return;
  try {
    const key = `${STORAGE_PREFIX}${brandSlug}`;
    const raw = localStorage.getItem(key);
    let list: string[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];

    // Filter out if already present, then prepend
    list = [productId, ...list.filter((id) => id !== productId)].slice(0, MAX_RECENT_ITEMS);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Ignore localStorage errors
  }
}

export function getRecentlyViewedIds(brandSlug: string): string[] {
  if (typeof window === "undefined" || !brandSlug) return [];
  try {
    const key = `${STORAGE_PREFIX}${brandSlug}`;
    const raw = localStorage.getItem(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

interface RecentlyViewedProps {
  excludeProductId?: string;
  className?: string;
}

export function RecentlyViewed({ excludeProductId, className = "" }: RecentlyViewedProps) {
  const { brand, t, settings } = useStorefront();
  const [productIds, setProductIds] = useState<string[]>([]);

  const isEnabled = settings?.recently_viewed_enabled !== false;

  useEffect(() => {
    if (!isEnabled) return;
    const ids = getRecentlyViewedIds(brand.slug).filter((id) => id !== excludeProductId);
    setProductIds(ids);
  }, [brand.slug, excludeProductId, isEnabled]);

  const { data: products = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "recently-viewed", productIds.join(",")],
    enabled: isEnabled && productIds.length > 0,
    queryFn: async () => {
      if (!productIds.length) return [];
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, custom_fields, is_active, product_variants(id, selling_price, original_price, stock_main, stock_incubator, size, color)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .in("id", productIds);

      if (error) return [];
      const list = (data ?? []) as unknown as ProductRow[];
      // Preserve recent order
      const map = new Map(list.map((p) => [p.id, p]));
      return productIds.map((id) => map.get(id)).filter(Boolean) as ProductRow[];
    },
    staleTime: 5 * 60_000,
  });

  if (!isEnabled || !products || products.length === 0) {
    return null;
  }

  return (
    <section className={`my-12 border-t border-border pt-8 w-full overflow-hidden ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-display text-xl sm:text-2xl text-foreground">
            {t("شوهدت مؤخراً", "Recently Viewed")}
          </h2>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">
          {t("اسحب للمزيد", "Scroll for more")}
        </span>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
        {products.map((p) => (
          <div key={p.id} className="w-[180px] sm:w-[220px] md:w-[240px] shrink-0 snap-start">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
