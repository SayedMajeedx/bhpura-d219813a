import { Link } from "@tanstack/react-router";
import { AlertCircle, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { inventoryIntelFor } from "@/features/dashboard/lib/dashboard-metrics";
import { arNoun, countOf } from "@/lib/arabic-count";

/**
 * The sizes closest to running out and the products for sale with no picture. Drawn only when
 * there is one of them: the count of products running low is a line of the attention list.
 */
export function StockAlertsCard({
  inventoryIntel,
  loading,
  isAr,
  slug,
}: {
  inventoryIntel: ReturnType<typeof inventoryIntelFor>;
  loading: boolean;
  isAr: boolean;
  slug: string;
}) {
  const lang = isAr ? "ar" : "en";
  if (loading) {
    return (
      <div
        role="status"
        aria-label={isAr ? "جارٍ تحميل المخزون" : "Loading stock"}
        className="space-y-2 rounded-2xl border border-border bg-card p-5"
      >
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  const { lowStockVariants, availableWithoutImages } = inventoryIntel;
  if (lowStockVariants.length === 0 && availableWithoutImages.length === 0) return null;

  return (
    <Card className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
        <h3 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
          <Package className="h-4.5 w-4.5 text-warning" aria-hidden />
          {isAr ? "مقاسات قاربت على النفاد" : "Sizes running out"}
        </h3>
        <Link
          to="/admin/b/$slug/inventory"
          params={{ slug }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {isAr ? "المخزون" : "Inventory"}
        </Link>
      </div>

      {lowStockVariants.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lowStockVariants.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-warning/20 bg-warning/10 p-2.5 text-xs"
            >
              <span className="line-clamp-2 min-w-0 break-words font-semibold text-foreground">
                {item.name}
              </span>
              <span className="shrink-0 rounded-full bg-warning/20 px-2 py-0.5 font-bold text-foreground">
                {item.stock === 0
                  ? isAr
                    ? "نفد"
                    : "Sold out"
                  : countOf(item.stock, "piece", lang)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {availableWithoutImages.length > 0 && (
        <div className="space-y-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3">
          <p className="flex items-center gap-2 text-xs font-bold text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            {isAr
              ? `متوفر بلا صور: ${arNoun(availableWithoutImages.length, "product")}`
              : `${countOf(availableWithoutImages.length, "product", "en")} for sale with no picture`}
          </p>
          {availableWithoutImages.slice(0, 3).map((product) => (
            <Link
              key={product.id}
              to="/admin/b/$slug/inventory"
              params={{ slug }}
              className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-2 text-xs hover:bg-background"
            >
              <span className="truncate font-semibold">{product.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {countOf(product.stock, "piece", lang)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
