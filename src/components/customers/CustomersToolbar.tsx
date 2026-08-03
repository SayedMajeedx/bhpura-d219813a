import React, { useEffect, useRef } from "react";
import { Search, X, MapPin } from "lucide-react";
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
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";

interface CustomersToolbarProps {
  lang: "en" | "ar";
  search: string;
  onSearchChange: (val: string) => void;
  regionFilter: string;
  onRegionChange: (val: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export const CustomersToolbar: React.FC<CustomersToolbarProps> = ({
  lang,
  search,
  onSearchChange,
  regionFilter,
  onRegionChange,
  activeFilterCount,
  onClearFilters,
}) => {
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-card border border-border/60 shadow-2xs">
      {/* Search Input */}
      <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            isAr
              ? "ابحث باسم العميل، رقم الهاتف، أو البريد الإلكتروني... (⌘K)"
              : "Search customer name, phone, or email... (⌘K)"
          }
          className="ps-9 h-8 text-xs bg-muted/30 border-border/60 focus:bg-background"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={isAr ? "مسح البحث" : "Clear search"}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
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
                {isAr ? "المنطقة" : "Region"}
              </label>
              <Select value={regionFilter} onValueChange={onRegionChange}>
                <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/60">
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent align={isAr ? "start" : "end"} className="text-xs">
                  <SelectItem value="all">{isAr ? "كل المناطق" : "All Regions"}</SelectItem>
                  {BAHRAIN_REGIONS.map((region) => (
                    <SelectItem key={region.value} value={region.value}>
                      {isAr ? region.ar : region.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              className="h-9 px-2.5 text-xs font-semibold"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
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
                  {isAr ? "المنطقة" : "Region"}
                </label>
                <Select value={regionFilter} onValueChange={onRegionChange}>
                  <SelectTrigger className="h-9 text-xs bg-muted/30 border-border/60">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent align={isAr ? "start" : "end"} className="text-xs">
                    <SelectItem value="all">{isAr ? "كل المناطق" : "All Regions"}</SelectItem>
                    {BAHRAIN_REGIONS.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {isAr ? region.ar : region.en}
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
          className="h-8 px-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5 me-1" />
          {isAr ? "مسح التصفية" : "Clear"}
        </Button>
      )}
    </div>
  );
};
