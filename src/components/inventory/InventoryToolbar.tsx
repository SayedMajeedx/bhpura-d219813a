import React, { useEffect, useRef } from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import { useShortcutHint } from "@/lib/platform-shortcut";
import { ATTENTION_KEYS, attentionReason } from "@/features/inventory/lib/attention";

interface CategoryOption {
  id: string;
  name: string;
  name_ar?: string | null;
}

interface InventoryToolbarProps {
  lang: "en" | "ar";
  /** A services store: the search names services, not products and barcodes. */
  services?: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  selectedCategory: string;
  onCategoryChange: (val: string) => void;
  categories: CategoryOption[];
  sortBy: string;
  onSortChange: (val: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  /** The issue filter ("all" or one issue); the control is left out when no handler is given. */
  selectedIssue?: string;
  onIssueChange?: (val: string) => void;
  /** False for a store that does not count stock: no stock sorts, no stock issues. */
  tracksStock?: boolean;
  /** The reader may see costs: only then can a product be filtered by having no cost. */
  showsCosts?: boolean;
  /** Drawn at the row's end, after the sort (the rows / photos switch). */
  trailing?: React.ReactNode;
}

const SORTS: Array<{ id: string; ar: string; en: string; stock?: boolean }> = [
  { id: "newest", ar: "الأحدث", en: "Newest" },
  { id: "name", ar: "الاسم", en: "Name" },
  { id: "best-selling", ar: "الأكثر مبيعاً", en: "Best selling" },
  { id: "price-asc", ar: "السعر: الأدنى", en: "Price: Low to High" },
  { id: "price-desc", ar: "السعر: الأعلى", en: "Price: High to Low" },
  { id: "stock-asc", ar: "المخزون: الأدنى", en: "Stock: Low to High", stock: true },
  { id: "stock-desc", ar: "المخزون: الأعلى", en: "Stock: High to Low", stock: true },
];

const STOCK_ISSUES = new Set(["out_of_stock", "low_stock", "hidden_with_stock"]);

export const InventoryToolbar: React.FC<InventoryToolbarProps> = ({
  lang,
  services = false,
  search,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  sortBy,
  onSortChange,
  activeFilterCount,
  onClearFilters,
  selectedIssue = "all",
  onIssueChange,
  tracksStock = true,
  showsCosts = false,
  trailing,
}) => {
  const isAr = lang === "ar";
  const shortcutHint = useShortcutHint();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sorts = SORTS.filter((sort) => tracksStock || !sort.stock);
  const issues = ATTENTION_KEYS.filter(
    (key) => (tracksStock || !STOCK_ISSUES.has(key)) && (showsCosts || key !== "missing_cost"),
  ).map(attentionReason);
  const categoryName = (id: string) => {
    const match = categories.find((cat) => cat.id === id);
    return match ? (isAr ? match.name_ar || match.name : match.name) : id;
  };
  const issueName = (key: string) => {
    const match = issues.find((issue) => issue.key === key);
    return match ? (isAr ? match.label_ar : match.label_en) : key;
  };

  const sortItems = sorts.map((sort) => (
    <SelectItem key={sort.id} value={sort.id}>
      {isAr ? sort.ar : sort.en}
    </SelectItem>
  ));

  const filterFields = (triggerClass: string) => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {isAr ? "القسم" : "Category"}
        </label>
        <Select value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder={isAr ? "جميع الأقسام" : "All Categories"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "جميع الأقسام" : "All Categories"}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {isAr ? cat.name_ar || cat.name : cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {onIssueChange && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            {isAr ? "المشكلة" : "Issue"}
          </label>
          <Select value={selectedIssue} onValueChange={onIssueChange}>
            <SelectTrigger
              className={triggerClass}
              aria-label={isAr ? "تصفية حسب المشكلة" : "Filter by issue"}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "أي حالة" : "Any"}</SelectItem>
              {issues.map((issue) => (
                <SelectItem key={issue.key} value={issue.key}>
                  {isAr ? issue.label_ar : issue.label_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );

  const chipClass =
    "inline-flex max-w-full items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-primary/10 text-primary border border-primary/20";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-card p-2 rounded-xl border border-border-subtle shadow-2xs">
        {/* Search Input - Flex 1 */}
        <div className="relative min-w-0 flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={
              services
                ? isAr
                  ? "ابحث باسم الخدمة"
                  : "Search services"
                : isAr
                  ? "ابحث باسم المنتج أو الباركود"
                  : "Search name or barcode"
            }
            placeholder={
              services
                ? isAr
                  ? "ابحث باسم الخدمة..."
                  : `Search services${shortcutHint}`
                : isAr
                  ? "ابحث باسم المنتج أو الباركود..."
                  : `Search name or barcode${shortcutHint}`
            }
            className="h-9 ps-9 text-xs bg-background/50 border-border-strong"
          />
        </div>

        {/* Desktop Filter Popover */}
        <div className="hidden sm:block">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label={isAr ? "فتح خيارات التصفية" : "Open filter options"}
                variant={activeFilterCount > 0 ? "default" : "outline"}
                size="sm"
                className="h-9 gap-1.5 text-xs font-semibold"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{isAr ? "التصفية" : "Filters"}</span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-xs font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align={isAr ? "start" : "end"} className="w-80 space-y-3 p-4">
              <div className="text-xs font-bold text-foreground">
                {isAr ? "تصفية المتقدمة" : "Advanced Filters"}
              </div>
              {filterFields("h-8 text-xs")}
            </PopoverContent>
          </Popover>
        </div>

        {/* Mobile Filter Sheet */}
        <div className="block sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                aria-label={isAr ? "فتح خيارات التصفية" : "Open filter options"}
                variant={activeFilterCount > 0 ? "default" : "outline"}
                size="sm"
                className="h-9 pointer-coarse:h-11 px-2.5 text-xs font-semibold"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1 py-0.2 text-xs">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="p-4 space-y-4">
              <SheetHeader>
                <SheetTitle className="text-sm font-bold">
                  {isAr ? "خيارات التصفية" : "Filter Options"}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3">
                {filterFields("h-9 text-xs")}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {isAr ? "الترتيب" : "Sort By"}
                  </label>
                  <Select value={sortBy} onValueChange={onSortChange}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>{sortItems}</SelectContent>
                  </Select>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Sort Select */}
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger
            className="h-9 w-40 text-xs border-border-strong hidden md:flex"
            aria-label={isAr ? "ترتيب المنتجات" : "Sort products"}
          >
            <ArrowUpDown className="h-3 w-3 me-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">{sortItems}</SelectContent>
        </Select>
        {trailing}
      </div>

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-xs text-muted-foreground font-medium me-1">
            {isAr ? "التصفية النشطة:" : "Active filters:"}
          </span>
          {selectedCategory !== "all" && (
            <span className={chipClass}>
              <span className="min-w-0 break-words">
                {isAr ? "القسم:" : "Category:"} {categoryName(selectedCategory)}
              </span>
              <button
                type="button"
                onClick={() => onCategoryChange("all")}
                aria-label={isAr ? "إزالة تصفية القسم" : "Remove category filter"}
                className="shrink-0 hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {onIssueChange && selectedIssue !== "all" && (
            <span className={chipClass}>
              <span className="min-w-0 break-words">
                {isAr ? "المشكلة:" : "Issue:"} {issueName(selectedIssue)}
              </span>
              <button
                type="button"
                onClick={() => onIssueChange("all")}
                aria-label={isAr ? "إزالة تصفية المشكلة" : "Remove issue filter"}
                className="shrink-0 hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground font-bold"
          >
            {isAr ? "مسح الكل" : "Clear all"}
          </Button>
        </div>
      )}
    </div>
  );
};
