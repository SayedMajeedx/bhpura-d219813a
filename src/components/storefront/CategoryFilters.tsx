import React from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";
import { resolveVariantAxis } from "@/lib/addons/addon-registry";
import { isColorSwatchAxis, useStoreAxisDefaults } from "@/lib/variant-axes";
import { formatSizeWithUnit } from "@/lib/format";
import { translateOptionValue } from "@/lib/variant-i18n";
import { activeFilterCount, type CatalogFacets, type FilterState } from "@/lib/category-filters";
import { cn } from "@/lib/utils";

export type { FilterState } from "@/lib/category-filters";

interface CategoryFiltersProps {
  filters: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  /** What can be picked on this page, each with how many products it would show. */
  facets: CatalogFacets;
  totalFilteredCount: number;
  className?: string;
}

const toggled = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/** One filter group: its name, a way to clear it, and its options. */
function Group({
  label,
  onClear,
  clearLabel,
  children,
}: {
  label: string;
  onClear?: () => void;
  clearLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" aria-label={label}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-foreground">{label}</h4>
        {onClear && (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={onClear}
            className="h-6 px-0 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            {clearLabel}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

const chipClass = (active: boolean, empty: boolean) =>
  cn(
    "min-h-11 min-w-10 rounded-lg border px-2.5 text-sm font-medium tabular-nums transition-colors sm:min-h-9",
    active
      ? "border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-card",
    // An option that would leave nothing: still readable, plainly out of play.
    empty && !active && "text-muted-foreground line-through opacity-50 hover:border-border",
  );

export function CategoryFilters({
  filters,
  onChange,
  facets,
  totalFilteredCount,
  className = "",
}: CategoryFiltersProps) {
  const { lang, t, settings } = useStorefront();
  const servicesStore = useIsServicesStore();
  const isAr = lang === "ar";
  const axisLang = isAr ? "ar" : "en";
  const currency = settings?.currency ?? "";

  // Filter headings follow the store's own option names (a roastery's "size"
  // is the bag weight and its "color" is the grind), not the column names.
  const axisDefaults = useStoreAxisDefaults();
  // A service's "size" is how long it is booked for.
  const sizeLabel = servicesStore
    ? t("المدة", "Duration")
    : resolveVariantAxis({
        axis: "size",
        addonDefaults: axisDefaults,
        lang: axisLang,
        hasValues: facets.sizes.length > 0,
      }).label;
  const colorLabel = resolveVariantAxis({
    axis: "color",
    addonDefaults: axisDefaults,
    lang: axisLang,
    hasValues: facets.colors.length > 0,
  }).label;
  const colorSwatches = isColorSwatchAxis(
    colorLabel,
    facets.colors.map((c) => c.name),
  );

  const activeCount = activeFilterCount(filters);
  const clear = t("مسح", "Clear");
  const countWord = (count: number) =>
    t(`${count} منتج`, count === 1 ? "1 item" : `${count} items`);

  // A range typed the wrong way round is put right when the shopper leaves the field.
  const settlePrice = () =>
    onChange((prev) =>
      prev.minPrice !== null && prev.maxPrice !== null && prev.minPrice > prev.maxPrice
        ? { ...prev, minPrice: prev.maxPrice, maxPrice: prev.minPrice }
        : prev,
    );
  const priceInput = (key: "minPrice" | "maxPrice", id: string, placeholder: number) => (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        placeholder={String(placeholder)}
        value={filters[key] ?? ""}
        onChange={(e) => {
          const value = e.target.value.trim() === "" ? null : Math.max(0, Number(e.target.value));
          onChange((prev) => ({ ...prev, [key]: value }));
        }}
        onBlur={settlePrice}
        className={cn("h-10 bg-card text-sm tabular-nums", currency ? "pe-12" : "")}
      />
      {currency && (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">
          {currency}
        </span>
      )}
    </div>
  );

  const selectedColors = filters.colors.map((name) => translateOptionValue(name, axisLang) || name);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header & Reset */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {servicesStore ? t("تصفية الخدمات", "Filter services") : t("تصفية المنتجات", "Filters")}
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            ({totalFilteredCount})
          </span>
        </div>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                sizes: [],
                colors: [],
                minPrice: null,
                maxPrice: null,
                inStockOnly: false,
              }))
            }
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t("إعادة ضبط", "Reset")}</span>
          </Button>
        )}
      </div>

      {/* In-Stock Only Switch (a service is booked, never out of stock) */}
      {!servicesStore && (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="filter-instock" className="cursor-pointer text-xs font-medium">
            {t("المتوفر في المخزون فقط", "In-stock items only")}
          </Label>
          <Switch
            id="filter-instock"
            checked={filters.inStockOnly}
            onCheckedChange={(checked) => onChange((prev) => ({ ...prev, inStockOnly: checked }))}
          />
        </div>
      )}

      {/* Sizes */}
      {facets.sizes.length > 0 && (
        <Group
          label={sizeLabel}
          clearLabel={clear}
          onClear={
            filters.sizes.length > 0
              ? () => onChange((prev) => ({ ...prev, sizes: [] }))
              : undefined
          }
        >
          {/* Equal columns, so the chips line up row after row instead of wrapping ragged. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
            {facets.sizes.map((size) => {
              const active = filters.sizes.includes(size.value);
              const empty = size.count === 0;
              return (
                <Button
                  key={size.value}
                  type="button"
                  variant="ghost"
                  aria-pressed={active}
                  aria-disabled={empty && !active ? true : undefined}
                  title={countWord(size.count)}
                  onClick={() => {
                    if (empty && !active) return;
                    onChange((prev) => ({ ...prev, sizes: toggled(prev.sizes, size.value) }));
                  }}
                  className={chipClass(active, empty)}
                >
                  {formatSizeWithUnit(size.value, size.unit ?? undefined, axisLang) || size.value}
                </Button>
              );
            })}
          </div>
        </Group>
      )}

      {/* Colors */}
      {facets.colors.length > 0 && (
        <Group
          label={colorLabel}
          clearLabel={clear}
          onClear={
            filters.colors.length > 0
              ? () => onChange((prev) => ({ ...prev, colors: [] }))
              : undefined
          }
        >
          <div className="flex flex-wrap gap-2.5">
            {facets.colors.map((color) => {
              const active = filters.colors.some(
                (c) => c.toLowerCase() === color.name.toLowerCase(),
              );
              const empty = color.count === 0;
              const pick = () => {
                if (empty && !active) return;
                onChange((prev) => ({
                  ...prev,
                  colors: active
                    ? prev.colors.filter((c) => c.toLowerCase() !== color.name.toLowerCase())
                    : toggled(prev.colors, color.name),
                }));
              };
              if (!colorSwatches) {
                return (
                  <Button
                    key={color.name}
                    type="button"
                    variant="ghost"
                    aria-pressed={active}
                    aria-disabled={empty && !active ? true : undefined}
                    title={countWord(color.count)}
                    onClick={pick}
                    className={chipClass(active, empty)}
                  >
                    {translateOptionValue(color.name, axisLang) || color.name}
                  </Button>
                );
              }
              return (
                <Button
                  key={color.name}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={color.name}
                  aria-pressed={active}
                  aria-disabled={empty && !active ? true : undefined}
                  title={`${translateOptionValue(color.name, axisLang) || color.name} · ${countWord(color.count)}`}
                  onClick={pick}
                  className={cn(
                    // The extra hit area keeps the touch target at 44px without a bigger swatch.
                    "relative size-8 rounded-full border border-border p-0 shadow-xs after:absolute after:-inset-1.5 after:content-[''] hover:bg-transparent",
                    active && "ring-2 ring-primary ring-offset-2",
                    empty && !active && "opacity-40",
                  )}
                  style={{ backgroundColor: color.hex ?? "var(--muted-foreground)" }}
                >
                  {active && (
                    <Check className="size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                  )}
                </Button>
              );
            })}
          </div>
          {colorSwatches && (
            <p className="min-h-4 text-xs text-muted-foreground">
              {selectedColors.length > 0
                ? selectedColors.join(isAr ? "، " : ", ")
                : t("كل الألوان", "All colours")}
            </p>
          )}
        </Group>
      )}

      {/* Price range */}
      {facets.price.max > 0 && (
        <Group
          label={t("نطاق السعر", "Price range")}
          clearLabel={clear}
          onClear={
            filters.minPrice !== null || filters.maxPrice !== null
              ? () => onChange((prev) => ({ ...prev, minPrice: null, maxPrice: null }))
              : undefined
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="filter-min-price"
                className="text-xs font-normal text-muted-foreground"
              >
                {t("من", "From")}
              </Label>
              {priceInput("minPrice", "filter-min-price", facets.price.min)}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="filter-max-price"
                className="text-xs font-normal text-muted-foreground"
              >
                {t("إلى", "To")}
              </Label>
              {priceInput("maxPrice", "filter-max-price", facets.price.max)}
            </div>
          </div>
        </Group>
      )}
    </div>
  );
}
