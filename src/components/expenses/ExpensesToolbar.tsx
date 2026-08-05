import React, { useEffect, useRef } from "react";
import { Search, Download, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

type DatePreset = "today" | "week" | "month" | "custom";

interface ExpensesToolbarProps {
  lang: "ar" | "en";
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  categories: string[];
  datePreset: DatePreset;
  onDatePresetChange: (preset: DatePreset) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  onDownloadCogsCsv: () => void;
}

export function ExpensesToolbar({
  lang,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
  datePreset,
  onDatePresetChange,
  activeFilterCount,
  onClearFilters,
  onDownloadCogsCsv,
}: ExpensesToolbarProps) {
  const isAr = lang === "ar";
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

  const presets: { id: DatePreset; labelAr: string; labelEn: string }[] = [
    { id: "today", labelAr: "اليوم", labelEn: "Today" },
    { id: "week", labelAr: "الأسبوع", labelEn: "This Week" },
    { id: "month", labelAr: "الشهر", labelEn: "This Month" },
    { id: "custom", labelAr: "الكل", labelEn: "All" },
  ];

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between p-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl shadow-2xs">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* Date Presets */}
        <div className="grid w-full grid-cols-4 gap-1 rounded-lg border border-border/40 bg-muted/40 p-0.5 sm:flex sm:w-auto sm:items-center">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onDatePresetChange(p.id)}
              className={cn(
                "min-h-9 min-w-0 truncate rounded-md px-1.5 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all duration-150 cursor-pointer",
                datePreset === p.id
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
              )}
            >
              {isAr ? p.labelAr : p.labelEn}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-full flex-1 sm:min-w-0 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              isAr ? "ابحث بالوصف أو المتجر... (⌘K)" : "Search description or store... (⌘K)"
            }
            className="ps-9 h-9 text-xs bg-background/80"
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
                className="h-9 gap-1.5 text-xs font-semibold bg-background/80"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{isAr ? "التصفية" : "Filters"}</span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align={isAr ? "start" : "end"} className="w-80 space-y-3 p-4">
              <div className="text-xs font-bold text-foreground">
                {isAr ? "تصفية المتقدمة" : "Advanced Filters"}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? "التصنيف" : "Category"}
                </label>
                <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
                  <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/60">
                    <SelectValue placeholder={isAr ? "جميع التصنيفات" : "All Categories"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {isAr ? "جميع التصنيفات" : "All Categories"}
                    </SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Mobile Filter Sheet */}
        <div className="block sm:hidden w-full">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                aria-label={isAr ? "فتح خيارات التصفية" : "Open filter options"}
                variant={activeFilterCount > 0 ? "default" : "outline"}
                size="sm"
                className="h-10 w-full gap-1.5 text-xs font-semibold bg-background/80 justify-center"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{isAr ? "التصفية" : "Filters"}</span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1 py-0.2 text-[10px]">
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
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {isAr ? "التصنيف" : "Category"}
                  </label>
                  <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
                    <SelectTrigger className="h-9 text-xs bg-muted/30 border-border/60">
                      <SelectValue placeholder={isAr ? "جميع التصنيفات" : "All Categories"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {isAr ? "جميع التصنيفات" : "All Categories"}
                      </SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3.5 w-3.5" />
            <span>{isAr ? "مسح" : "Clear"}</span>
          </Button>
        )}
      </div>

      {/* COGS Exporter */}
      <Button
        variant="outline"
        size="sm"
        onClick={onDownloadCogsCsv}
        className="h-10 w-full text-xs font-bold gap-1.5 sm:h-9 sm:w-auto self-start sm:self-auto border-border/60 hover:bg-muted/40"
      >
        <Download className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>{isAr ? "تصدير تكلفة المبيعات (COGS CSV)" : "Export COGS CSV"}</span>
      </Button>
    </div>
  );
}
