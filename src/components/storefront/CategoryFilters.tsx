import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveColorHex } from "@/lib/color-names";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { X, RotateCcw } from "lucide-react";

export interface FilterState {
  size: string | null;
  color: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  sort: "new" | "old" | "price-low" | "price-high" | "best";
}

interface CategoryFiltersProps {
  filters: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  availableSizes: string[];
  availableColors: Array<{ name: string; hex: string | null }>;
  minCatalogPrice: number;
  maxCatalogPrice: number;
  totalFilteredCount: number;
  className?: string;
}

export function CategoryFilters({
  filters,
  onChange,
  availableSizes,
  availableColors,
  minCatalogPrice,
  maxCatalogPrice,
  totalFilteredCount,
  className = "",
}: CategoryFiltersProps) {
  const { lang, t, currency } = useStorefront();
  const isAr = lang === "ar";

  const hasActiveFilters = Boolean(
    filters.size ||
    filters.color ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.inStockOnly,
  );

  const handleReset = () => {
    onChange((prev) => ({
      ...prev,
      size: null,
      color: null,
      minPrice: null,
      maxPrice: null,
      inStockOnly: false,
    }));
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header & Reset */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t("تصفية المنتجات", "Filters")}
          </h3>
          <span className="text-xs text-muted-foreground">({totalFilteredCount})</span>
        </div>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t("إعادة ضبط", "Reset")}</span>
          </Button>
        )}
      </div>

      {/* In-Stock Only Switch */}
      <div className="flex items-center justify-between">
        <label htmlFor="filter-instock" className="text-xs font-medium cursor-pointer">
          {t("المتوفر في المخزون فقط", "In-stock items only")}
        </label>
        <input
          id="filter-instock"
          type="checkbox"
          checked={filters.inStockOnly}
          onChange={(e) => onChange((prev) => ({ ...prev, inStockOnly: e.target.checked }))}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
        />
      </div>

      {/* Sizes Section */}
      {availableSizes.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("المقاس", "Size")}
            </span>
            {filters.size && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange((prev) => ({ ...prev, size: null }))}
                className="h-auto rounded-md text-xs text-muted-foreground hover:text-foreground"
              >
                {t("مسح", "Clear")}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableSizes.map((s) => {
              const active = filters.size === s;
              return (
                <Button
                  key={s}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange((prev) => ({ ...prev, size: active ? null : s }))}
                  className={`h-auto rounded-md px-2.5 py-1 text-xs rounded-md border font-medium transition-all ${
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-card text-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {s}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Colors Section */}
      {availableColors.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("اللون", "Color")}
            </span>
            {filters.color && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange((prev) => ({ ...prev, color: null }))}
                className="h-auto rounded-md text-xs text-muted-foreground hover:text-foreground"
              >
                {t("مسح", "Clear")}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableColors.map((c) => {
              const hex = c.hex || resolveColorHex(c.name) || "#94a3b8";
              const active = filters.color === c.name;
              return (
                <Button
                  key={c.name}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange((prev) => ({ ...prev, color: active ? null : c.name }))}
                  title={c.name}
                  aria-label={c.name}
                  className={`h-auto rounded-md h-6 w-6 rounded-full hover:bg-transparent border border-border shadow-xs transition-transform hover:scale-110 flex items-center justify-center ${
                    active ? "ring-2 ring-primary ring-offset-2 scale-110" : ""
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-white shadow-xs" />}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Price Range Section */}
      <div className="space-y-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("نطاق السعر", "Price Range")}
        </span>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type="number"
              placeholder={String(minCatalogPrice || 0)}
              value={filters.minPrice ?? ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                onChange((prev) => ({ ...prev, minPrice: val }));
              }}
              className="h-8 text-xs ps-2 pe-1 bg-card border-border"
            />
          </div>
          <span className="text-xs text-muted-foreground">–</span>
          <div className="relative flex-1">
            <Input
              type="number"
              placeholder={String(maxCatalogPrice || 100)}
              value={filters.maxPrice ?? ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                onChange((prev) => ({ ...prev, maxPrice: val }));
              }}
              className="h-8 text-xs ps-2 pe-1 bg-card border-border"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
