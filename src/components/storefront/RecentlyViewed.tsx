import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { ProductCard } from "@/components/storefront/product-card";
import { storefrontQueries } from "@/lib/data/storefront";
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
    ...storefrontQueries.productsByIds(brand, "recently-viewed", productIds),
    enabled: isEnabled && productIds.length > 0,
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
