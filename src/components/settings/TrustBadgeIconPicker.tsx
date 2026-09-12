import{ useState, useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TRUST_ICON_CATALOG,
  renderTrustBadgeIcon,
  getColorPreset,
} from "@/lib/trust-badges";
import { Search, ChevronDown, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrustBadgeIconPickerProps {
  value: string;
  onChange: (iconKey: string) => void;
  colorId?: string;
  isAr?: boolean;
}

type CategoryFilter = "all" | "quality" | "payment" | "security" | "delivery" | "support" | "general";

const CATEGORIES: { id: CategoryFilter; label_ar: string; label_en: string }[] = [
  { id: "all", label_ar: "الكل", label_en: "All" },
  { id: "quality", label_ar: "الأزياء والجودة", label_en: "Quality & Fashion" },
  { id: "payment", label_ar: "الدفع والمالية", label_en: "Payments" },
  { id: "security", label_ar: "الأمان والتوثيق", label_en: "Security" },
  { id: "delivery", label_ar: "الشحن والتسليم", label_en: "Fulfillment" },
  { id: "support", label_ar: "الضمان والدعم", label_en: "Support & Care" },
  { id: "general", label_ar: "تسويق ومميزات", label_en: "General" },
];

export function TrustBadgeIconPicker({
  value,
  onChange,
  colorId = "amber",
  isAr = true,
}: TrustBadgeIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");

  const selectedCatalogItem = useMemo(() => {
    return TRUST_ICON_CATALOG.find(
      (item) => item.id.toLowerCase() === value.toLowerCase() || item.name.toLowerCase() === value.toLowerCase()
    );
  }, [value]);

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();

    return TRUST_ICON_CATALOG.filter((item) => {
      // Category check
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }

      // If no search query, match category
      if (!q) return true;

      // Match query across: name, localized labels, descriptions, and keywords
      const matchName = item.name.toLowerCase().includes(q);
      const matchLabelAr = item.label_ar.toLowerCase().includes(q);
      const matchLabelEn = item.label_en.toLowerCase().includes(q);
      const matchDescAr = item.description_ar.toLowerCase().includes(q);
      const matchDescEn = item.description_en.toLowerCase().includes(q);
      const matchKeywords = item.keywords.some((k) => k.toLowerCase().includes(q));

      return matchName || matchLabelAr || matchLabelEn || matchDescAr || matchDescEn || matchKeywords;
    });
  }, [search, selectedCategory]);

  const colorPreset = getColorPreset(colorId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="default"
          className={cn(
            "h-11 min-w-[140px] justify-between gap-2 px-3 border-border bg-card hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isAr ? "flex-row-reverse" : "flex-row"
          )}
          aria-label={isAr ? "اختر أيقونة الشارة" : "Choose badge icon"}
        >
          <div className={cn("flex items-center gap-2 overflow-hidden", isAr ? "flex-row-reverse" : "flex-row")}>
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle", colorPreset.bgClass)}>
              {renderTrustBadgeIcon(value, "h-4 w-4", colorId)}
            </div>
            <span className="text-xs font-medium truncate max-w-[90px]">
              {selectedCatalogItem
                ? isAr
                  ? selectedCatalogItem.label_ar
                  : selectedCatalogItem.label_en
                : value || (isAr ? "أيقونة" : "Icon")}
            </span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={isAr ? "start" : "end"}
        className="w-[340px] sm:w-[420px] p-0 shadow-xl border-border bg-popover"
        dir={isAr ? "rtl" : "ltr"}
      >
        {/* Header & Search Input */}
        <div className="p-3 border-b border-border bg-muted/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {isAr ? "اختيار أيقونة الشارة" : "Select Badge Icon"}
            </span>
            <span className="text-xs text-muted-foreground">
              {filteredIcons.length} {isAr ? "أيقونة متاحة" : "icons"}
            </span>
          </div>

          <div className="relative">
            <Search
              className="absolute top-1/2 -translate-y-1/2 start-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isAr
                  ? "ابحث باسم الأيقونة أو الوصف (أمان، شحن، كاش، جودة)..."
                  : "Search by text or description (security, cash, fast)..."
              }
              className="h-9 text-xs bg-background border-border ps-8 pe-3"
              autoFocus
            />
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                type="button"
                variant={selectedCategory === cat.id ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-xs rounded-md shrink-0 font-normal",
                  selectedCategory === cat.id && "font-semibold"
                )}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {isAr ? cat.label_ar : cat.label_en}
              </Button>
            ))}
          </div>
        </div>

        {/* Icons Grid */}
        <div className="max-h-[300px] overflow-y-auto p-3">
          {filteredIcons.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {isAr ? "لا توجد أيقونات تطابق بحثك" : "No icons matching your search"}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
              {filteredIcons.map((item) => {
                const isSelected =
                  value.toLowerCase() === item.id.toLowerCase() ||
                  value.toLowerCase() === item.name.toLowerCase();
                const IconComp = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-start gap-2.5 p-2 rounded-xl text-start transition-all border min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground shadow-xs"
                        : "border-border-subtle hover:border-border hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        isSelected ? "border-primary/40 bg-primary/20" : "border-border-strong bg-card",
                        colorPreset.textClass
                      )}
                    >
                      <IconComp className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold truncate leading-tight">
                          {isAr ? item.label_ar : item.label_en}
                        </span>
                        {isSelected && <Check className="h-3 w-3 text-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 leading-snug">
                        {isAr ? item.description_ar : item.description_en}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer tip */}
        <div className="p-2 border-t border-border bg-muted/20 text-xs text-muted-foreground text-center">
          {isAr
            ? "تلميح: يمكنك البحث بكلمات مثل 'بنفت'، 'تشفير'، 'توصيل'، 'عباية'"
            : "Tip: Search for keywords like 'benefit', 'ssl', 'courier', 'guarantee'"}
        </div>
      </PopoverContent>
    </Popover>
  );
}
