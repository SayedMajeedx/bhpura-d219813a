import { useEffect, useState } from "react";
import { Grid2X2, Rows, PackageSearch } from "lucide-react";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { type ProductRow } from "@/lib/data/storefront";
import { ProductCard } from "./product-card";

/**
 * A list up to SHOW_ALL_UP_TO products is shown whole (images load lazily as they come into
 * view, so a few dozen cards cost little). A longer one shows PAGE_SIZE at a time with a
 * "Show more" button, and remembers how far the shopper went for the length of the visit so
 * that coming back from a product lands in the same place.
 */
export const SHOW_ALL_UP_TO = 36;
export const PAGE_SIZE = 24;

const shownKey = () => `storefront-grid-shown:${window.location.pathname}${window.location.search}`;

export function ProductGrid({
  products,
  loading,
  categoryEmpty,
  onViewAll,
  withSidebar = false,
}: {
  products: ProductRow[];
  loading: boolean;
  categoryEmpty: boolean;
  onViewAll: () => void;
  /**
   * The page has a filter sidebar beside the grid. The grid then has about 1,000px, and four
   * columns would make cards a marketplace's size (235px); three keep them a boutique's.
   */
  withSidebar?: boolean;
}) {
  const { t } = useStorefront();
  const wide = withSidebar ? "lg:grid-cols-3" : "lg:grid-cols-4";
  // A services store lists services, not products.
  const services = useIsServicesStore();

  // [TECH ADVISOR #2]: Hydration guard. Initial render uses "2" columns.
  // Read preference from localStorage only in useEffect after mount to completely prevent hydration mismatches!
  const [mobileCols, setMobileCols] = useState("2");
  const [, setMounted] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  // The same list again (a filter changed and came back, or the shopper returned from a product):
  // pick up how many were showing.
  const listKey = `${products.length}:${products[0]?.id ?? ""}`;
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem(shownKey()));
      setShown(Number.isFinite(saved) && saved > PAGE_SIZE ? saved : PAGE_SIZE);
    } catch {
      setShown(PAGE_SIZE);
    }
  }, [listKey]);
  const showMore = () => {
    const next = shown + PAGE_SIZE;
    setShown(next);
    try {
      sessionStorage.setItem(shownKey(), String(next));
    } catch {
      // Storage unavailable: the shopper just starts from the first page next time.
    }
  };
  const paged = products.length > SHOW_ALL_UP_TO;
  const visible = paged ? products.slice(0, shown) : products;

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("storefront-mobile-cols");
      if (saved === "1" || saved === "2") {
        setMobileCols(saved);
      }
    } catch {
      // Storage unavailable (e.g. private mode): keep the default columns.
    }
  }, []);

  const toggleMobileCols = (cols: "1" | "2") => {
    setMobileCols(cols);
    try {
      localStorage.setItem("storefront-mobile-cols", cols);
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Skeleton controls bar */}
        <div className="flex justify-end h-10" />
        <div
          className={`grid ${
            mobileCols === "1" ? "grid-cols-1" : "grid-cols-2"
          } md:grid-cols-3 ${wide} gap-4 sm:gap-6`}
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
            ? services
              ? t("لا توجد خدمات متاحة", "No services available")
              : t("لا توجد منتجات متاحة", "No products available")
            : services
              ? t("لا توجد خدمات بعد", "No services yet")
              : t("لا توجد منتجات بعد", "No products yet")
        }
        description={
          categoryEmpty
            ? services
              ? t(
                  "لا توجد خدمات متاحة في هذا القسم حالياً. يمكنك تصفح كافة الخدمات الأخرى.",
                  "No services are currently available in this category. You can browse all other services.",
                )
              : t(
                  "لا توجد منتجات متاحة في هذا القسم حالياً. يمكنك تصفح كافة المنتجات الأخرى.",
                  "No products are currently available in this category. You can browse all other products.",
                )
            : services
              ? t(
                  "لم تتم إضافة أي خدمات إلى هذا المتجر حتى الآن.",
                  "No services have been added to this store yet.",
                )
              : t(
                  "لم يتم إضافة أي منتجات إلى هذا المتجر حتى الآن.",
                  "No products have been added to this store yet.",
                )
        }
        action={
          categoryEmpty ? (
            <Button variant="default" onClick={onViewAll}>
              {services
                ? t("عرض كل الخدمات", "View all services")
                : t("عرض كل المنتجات", "View all products")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Dynamic Grid Layout Switcher control bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <span className="text-xs text-muted-foreground font-medium">
          {products.length}{" "}
          {services
            ? products.length === 1
              ? t("خدمة", "service")
              : t("خدمات", "services")
            : products.length === 1
              ? t("منتج", "product")
              : t("منتجات", "products")}
        </span>

        {/* Toggle columns trigger button (strictly visible on mobile viewport <md) */}
        <div className="flex items-center gap-1.5 md:hidden">
          <Button
            type="button"
            variant={mobileCols === "2" ? "default" : "outline"}
            size="icon-touch"
            onClick={() => toggleMobileCols("2")}
            aria-label={t("عرض شبكة ثنائية", "Dense 2-Column Grid")}
          >
            <Grid2X2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={mobileCols === "1" ? "default" : "outline"}
            size="icon-touch"
            onClick={() => toggleMobileCols("1")}
            aria-label={t("عرض قائمة عمودية", "Immersive 1-Column List")}
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
        } md:grid-cols-3 ${wide} gap-4 sm:gap-6`}
      >
        {visible.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>

      {paged && (
        <div className="flex flex-col items-center gap-3 pt-4">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t(
              `تعرض ${Math.min(visible.length, products.length)} من ${products.length}`,
              `Showing ${Math.min(visible.length, products.length)} of ${products.length}`,
            )}
          </p>
          {visible.length < products.length && (
            <Button type="button" variant="outline" size="touch" onClick={showMore}>
              {t("عرض المزيد", "Show more")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
