import { useEffect, useState, type ReactNode } from "react";
import { Grid2X2, Rows, PackageSearch } from "lucide-react";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";
import { PRODUCT_PHOTO_CLASS, productCardRatio } from "@/lib/brand-templates/design-presets";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { type ProductRow } from "@/lib/data/storefront";
import { ProductCard } from "./product-card";
import { catalogCount } from "@/lib/catalog-count";
import type { SmartKind } from "@/lib/smart-categories";
import { emptyCollectionWords } from "@/lib/smart-collections";

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
  toolbar,
  total,
  footer,
  emptyCollection,
}: {
  products: ProductRow[];
  loading: boolean;
  categoryEmpty: boolean;
  /**
   * The page is this automatic collection and it lists nothing before the shopper's filters: the
   * empty state says why in the collection's own words (`emptyCollectionWords`).
   */
  emptyCollection?: SmartKind | null;
  onViewAll: () => void;
  /**
   * The page has a filter sidebar beside the grid. The grid then has about 1,000px, and four
   * columns would make cards a marketplace's size (235px); three keep them a boutique's.
   */
  withSidebar?: boolean;
  /**
   * The page's own controls (filters, sort), drawn in the grid's bar beside the phone's column
   * switch, in place of the count: the page says the count under its heading. One row, where
   * a category page had three (a count, the controls, then the count again).
   */
  toolbar?: ReactNode;
  /** The whole list's count, when the grid shows a part of it (the home page's first pieces). */
  total?: number;
  /** Under the grid: the home page's "View all". */
  footer?: ReactNode;
}) {
  const { t, settings, lang } = useStorefront();
  // The placeholders take the cards' own photo shape, so nothing jumps when they load.
  const photoClass = PRODUCT_PHOTO_CLASS[productCardRatio(settings)];
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
              <Skeleton className={`${photoClass} rounded-xl w-full bg-muted`} />
              <Skeleton className="h-3 w-3/4 bg-muted" />
              <Skeleton className="h-3 w-1/3 bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    // An automatic collection with nothing in it says why (nothing on sale, nothing new).
    const collectionWords = categoryEmpty
      ? emptyCollectionWords(emptyCollection ?? null, services)
      : null;
    // The page's controls stay: a filter that left nothing can be undone from here.
    return (
      <div className="space-y-4">
        {toolbar && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
            {toolbar}
          </div>
        )}
        <OsEmptyState
          icon={PackageSearch}
          title={
            collectionWords
              ? t(collectionWords.title.ar, collectionWords.title.en)
              : categoryEmpty
                ? services
                  ? t("لا توجد خدمات متاحة", "No services available")
                  : t("لا توجد منتجات متاحة", "No products available")
                : services
                  ? t("لا توجد خدمات بعد", "No services yet")
                  : t("لا توجد منتجات بعد", "No products yet")
          }
          description={
            collectionWords
              ? t(collectionWords.body.ar, collectionWords.body.en)
              : categoryEmpty
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dynamic Grid Layout Switcher control bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        {toolbar ?? (
          <span className="text-xs text-muted-foreground font-medium">
            {catalogCount(total ?? products.length, {
              services,
              lang: lang === "ar" ? "ar" : "en",
            })}
          </span>
        )}

        {/* One button switches a phone's grid between two columns and one (two buttons once
            pushed it onto a row of its own). */}
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          className="ms-auto shrink-0 md:hidden"
          onClick={() => toggleMobileCols(mobileCols === "1" ? "2" : "1")}
          aria-label={
            mobileCols === "1"
              ? t("عرض عمودين", "Show two columns")
              : t("عرض عمود واحد", "Show one column")
          }
        >
          {mobileCols === "1" ? <Grid2X2 className="h-4 w-4" /> : <Rows className="h-4 w-4" />}
        </Button>
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
      {footer}
    </div>
  );
}
