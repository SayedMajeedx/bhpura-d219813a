import React, { useEffect, useState } from "react";
import { Grid2X2, Rows, PackageSearch } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { type ProductRow } from "@/routes/$slug.index";
import { ProductCard } from "./product-card";

export function ProductGrid({
  products,
  loading,
  categoryEmpty,
  onViewAll,
}: {
  products: ProductRow[];
  loading: boolean;
  categoryEmpty: boolean;
  onViewAll: () => void;
}) {
  const { t, lang } = useStorefront();

  // [TECH ADVISOR #2]: Hydration guard. Initial render uses "2" columns.
  // Read preference from localStorage only in useEffect after mount to completely prevent hydration mismatches!
  const [mobileCols, setMobileCols] = useState("2");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("storefront-mobile-cols");
      if (saved === "1" || saved === "2") {
        setMobileCols(saved);
      }
    } catch {}
  }, []);

  const toggleMobileCols = (cols: "1" | "2") => {
    setMobileCols(cols);
    try {
      localStorage.setItem("storefront-mobile-cols", cols);
    } catch {}
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Skeleton controls bar */}
        <div className="flex justify-end h-10" />
        <div
          className={`grid ${
            mobileCols === "1" ? "grid-cols-1" : "grid-cols-2"
          } md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6`}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[3/4] rounded-xl w-full bg-muted" />
              <Skeleton className="h-3 w-3/4 bg-muted" />
              <Skeleton className="h-3 w-1/3 bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <OsEmptyState
        icon={PackageSearch}
        title={
          categoryEmpty
            ? t("لا توجد منتجات متاحة", "No products available")
            : t("لا توجد منتجات بعد", "No products yet")
        }
        description={
          categoryEmpty
            ? t(
                "لا توجد منتجات متاحة في هذا القسم حالياً. يمكنك تصفح كافة المنتجات الأخرى.",
                "No products are currently available in this category. You can browse all other products.",
              )
            : t(
                "لم يتم إضافة أي منتجات إلى هذا المتجر حتى الآن.",
                "No products have been added to this store yet.",
              )
        }
        action={
          categoryEmpty ? (
            <Button variant="default" onClick={onViewAll}>
              {t("عرض كل المنتجات", "View all products")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Dynamic Grid Layout Switcher control bar */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <span className="text-xs text-muted-foreground font-medium">
          {products.length} {products.length === 1 ? t("منتج", "product") : t("منتجات", "products")}
        </span>

        {/* Toggle columns trigger button (strictly visible on mobile viewport <md) */}
        <div className="flex items-center gap-1.5 md:hidden">
          <Button
            type="button"
            variant={mobileCols === "2" ? "default" : "outline"}
            size="icon"
            onClick={() => toggleMobileCols("2")}
            aria-label={t("عرض شبكة ثنائية", "Dense 2-Column Grid")}
            className="h-11 w-11"
          >
            <Grid2X2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={mobileCols === "1" ? "default" : "outline"}
            size="icon"
            onClick={() => toggleMobileCols("1")}
            aria-label={t("عرض قائمة عمودية", "Immersive 1-Column List")}
            className="h-11 w-11"
          >
            <Rows className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid container responsive columns based on toggled preference */}
      <div
        id="products"
        className={`grid ${
          mobileCols === "1" ? "grid-cols-1" : "grid-cols-2"
        } md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6`}
      >
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </div>
  );
}
