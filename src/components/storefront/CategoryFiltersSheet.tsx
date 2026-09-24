import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CategoryFilters, type FilterState } from "@/components/storefront/CategoryFilters";
import { useStorefront } from "@/lib/storefront-context";
import { SlidersHorizontal } from "lucide-react";

interface CategoryFiltersSheetProps {
  filters: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  availableSizes: string[];
  sizeUnits?: Record<string, string>;
  availableColors: Array<{ name: string; hex: string | null }>;
  minCatalogPrice: number;
  maxCatalogPrice: number;
  totalFilteredCount: number;
}

export function CategoryFiltersSheet({
  filters,
  onChange,
  availableSizes,
  sizeUnits,
  availableColors,
  minCatalogPrice,
  maxCatalogPrice,
  totalFilteredCount,
}: CategoryFiltersSheetProps) {
  const { t } = useStorefront();
  const [open, setOpen] = useState(false);

  const activeCount = [
    Boolean(filters.size),
    Boolean(filters.color),
    filters.minPrice !== null,
    filters.maxPrice !== null,
    filters.inStockOnly,
  ].filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-3.5 gap-2 text-xs font-semibold rounded-lg border-border bg-card text-foreground flex items-center lg:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{t("الفلاتر", "Filters")}</span>
          {activeCount > 0 && (
            <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-t-2xl p-0 flex flex-col bg-background"
      >
        <SheetHeader className="p-4 border-b border-border text-start">
          <SheetTitle className="text-sm font-semibold">
            {t("تصفية المنتجات", "Filter Products")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <CategoryFilters
            filters={filters}
            onChange={onChange}
            availableSizes={availableSizes}
            sizeUnits={sizeUnits}
            availableColors={availableColors}
            minCatalogPrice={minCatalogPrice}
            maxCatalogPrice={maxCatalogPrice}
            totalFilteredCount={totalFilteredCount}
          />
        </div>

        <div className="p-4 border-t border-border bg-card">
          <Button
            type="button"
            className="w-full h-11 text-sm font-semibold rounded-xl bg-primary text-primary-foreground"
            onClick={() => setOpen(false)}
          >
            {t(`عرض النتائج (${totalFilteredCount})`, `View results (${totalFilteredCount})`)}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
