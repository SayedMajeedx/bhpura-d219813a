import React, { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
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

interface DiscountsToolbarProps {
  lang: "ar" | "en";
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export function DiscountsToolbar({
  lang,
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  activeFilterCount,
  onClearFilters,
}: DiscountsToolbarProps) {
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

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between p-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl shadow-2xs">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isAr ? "ابحث برمز الخصم... (⌘K)" : "Search by promo code... (⌘K)"}
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
                  {isAr ? "نوع الخصم" : "Discount Type"}
                </label>
                <Select value={typeFilter} onValueChange={onTypeFilterChange}>
                  <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/60">
                    <SelectValue placeholder={isAr ? "جميع الأنواع" : "All Types"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "جميع الأنواع" : "All Types"}</SelectItem>
                    <SelectItem value="percentage">{isAr ? "نسبة مئوية (%)" : "Percentage (%)"}</SelectItem>
                    <SelectItem value="fixed">{isAr ? "مبلغ ثابت" : "Fixed Amount"}</SelectItem>
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
                className="h-9 w-full gap-1.5 text-xs font-semibold bg-background/80 justify-center"
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
                    {isAr ? "نوع الخصم" : "Discount Type"}
                  </label>
                  <Select value={typeFilter} onValueChange={onTypeFilterChange}>
                    <SelectTrigger className="h-9 text-xs bg-muted/30 border-border/60">
                      <SelectValue placeholder={isAr ? "جميع الأنواع" : "All Types"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "جميع الأنواع" : "All Types"}</SelectItem>
                      <SelectItem value="percentage">{isAr ? "نسبة مئوية (%)" : "Percentage (%)"}</SelectItem>
                      <SelectItem value="fixed">{isAr ? "مبلغ ثابت" : "Fixed Amount"}</SelectItem>
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
            className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3.5 w-3.5" />
            <span>{isAr ? "مسح التصفية" : "Clear"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
