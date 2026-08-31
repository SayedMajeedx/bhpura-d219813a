import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  Star,
  Compass,
  Boxes,
  Zap,
  Sliders,
  X,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type AdminNavItemConfig,
  DEFAULT_PINNED_IDS,
} from "@/config/admin-navigation";

export interface OsAppsHubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  lang: "en" | "ar";
  onPinnedChange?: (pinnedIds: string[]) => void;
}

type CategoryTab = "all" | "pinned" | "operations" | "growth_finance" | "storefront_settings";

export function OsAppsHubModal({
  open,
  onOpenChange,
  activeSlug,
  navItems,
  lang,
  onPinnedChange,
}: OsAppsHubModalProps) {
  const isAr = lang === "ar";
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryTab>("all");

  // Read pinned state from localStorage
  const [pinnedIds, setPinnedIds] = React.useState<string[]>(() => {
    if (!activeSlug || typeof window === "undefined") {
      return [...DEFAULT_PINNED_IDS];
    }
    try {
      const saved = localStorage.getItem(`boutq_pinned_nav_${activeSlug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [...DEFAULT_PINNED_IDS];
  });

  // Re-sync when activeSlug or modal opens
  React.useEffect(() => {
    if (!activeSlug || typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(`boutq_pinned_nav_${activeSlug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setPinnedIds(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setPinnedIds([...DEFAULT_PINNED_IDS]);
  }, [activeSlug, open]);

  const togglePin = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setPinnedIds((prev) => {
      const isPinned = prev.includes(itemId);
      const next = isPinned ? prev.filter((id) => id !== itemId) : [...prev, itemId];
      if (activeSlug && typeof window !== "undefined") {
        try {
          localStorage.setItem(`boutq_pinned_nav_${activeSlug}`, JSON.stringify(next));
          window.dispatchEvent(new Event("boutq-pinned-nav-updated"));
        } catch {
          // ignore
        }
      }
      onPinnedChange?.(next);
      return next;
    });
  };

  // Modular items only
  const modularItems = React.useMemo(() => {
    return navItems.filter((item) => item.tier === "modular");
  }, [navItems]);

  const pinnedCount = React.useMemo(() => {
    return modularItems.filter((i) => pinnedIds.includes(i.id)).length;
  }, [modularItems, pinnedIds]);

  // Categories config
  const categories = [
    {
      id: "all" as const,
      label: isAr ? "الكل" : "All",
      count: modularItems.length,
      icon: Compass,
    },
    {
      id: "pinned" as const,
      label: isAr ? "المثبتة" : "Pinned",
      count: pinnedCount,
      icon: Star,
    },
    {
      id: "operations" as const,
      label: isAr ? "العمليات" : "Operations",
      count: modularItems.filter((i) => i.section === "operations").length,
      icon: Boxes,
    },
    {
      id: "growth_finance" as const,
      label: isAr ? "التسويق والمالية" : "Growth",
      count: modularItems.filter((i) => i.section === "growth_finance").length,
      icon: Zap,
    },
    {
      id: "storefront_settings" as const,
      label: isAr ? "المتجر" : "Store",
      count: modularItems.filter((i) => i.section === "storefront_settings").length,
      icon: Sliders,
    },
  ];

  // Filtered items
  const filteredItems = React.useMemo(() => {
    return modularItems.filter((item) => {
      // Category match
      if (selectedCategory === "pinned") {
        if (!pinnedIds.includes(item.id)) return false;
      } else if (selectedCategory !== "all" && item.section !== selectedCategory) {
        return false;
      }

      // Search match
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const nameAr = item.labelAr.toLowerCase();
      const nameEn = item.labelEn.toLowerCase();
      const descAr = (item.descriptionAr || "").toLowerCase();
      const descEn = (item.descriptionEn || "").toLowerCase();

      return (
        nameAr.includes(q) ||
        nameEn.includes(q) ||
        descAr.includes(q) ||
        descEn.includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [modularItems, selectedCategory, searchQuery, pinnedIds]);

  const handleLaunch = (item: AdminNavItemConfig) => {
    onOpenChange(false);
    navigate({
      to: item.to as any,
      params: item.params as any,
      search: (item.id === "campaigns" ? { segment: "All" } : undefined) as any,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden border border-border shadow-xl rounded-2xl bg-card text-foreground">
        {/* Header with Title & Search */}
        <DialogHeader className="p-5 pb-3 border-b border-border bg-muted/10 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold font-heading text-foreground flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <span>{isAr ? "مركز الأدوات" : "Apps & Tools Hub"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "اختر أداة لفتحها، أو اضغط على النجمة لتثبيتها في شريطك الجانبي."
                  : "Click any tool to launch, or star it to keep it in your sidebar."}
              </DialogDescription>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? "بحث عن أداة (المرتجعات، واتساب، الخصومات...)"
                  : "Search tools (returns, whatsapp, discounts...)"
              }
              className="ps-9 pe-9 h-10 text-xs sm:text-sm bg-background border-border rounded-xl focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 -translate-y-1/2 end-3 h-5 w-5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                aria-label={isAr ? "مسح البحث" : "Clear search"}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{cat.label}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1 rounded font-mono",
                      isSelected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "text-muted-foreground/80",
                    )}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogHeader>

        {/* Tools List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-1.5">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Boxes className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs font-medium text-muted-foreground">
                {isAr ? "لا توجد أدوات مطابقة للبحث" : "No matching tools found"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredItems.map((item) => {
                const Icon = item.icon;
                const isPinned = pinnedIds.includes(item.id);
                const title = isAr ? item.labelAr : item.labelEn;
                const description = isAr
                  ? item.descriptionAr || ""
                  : item.descriptionEn || "";

                return (
                  <div
                    key={item.id}
                    onClick={() => handleLaunch(item)}
                    className={cn(
                      "group relative flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none",
                      isPinned
                        ? "bg-primary/5 border-primary/25 hover:border-primary/50 hover:bg-primary/10"
                        : "bg-background hover:bg-muted/50 border-border/70 hover:border-border",
                    )}
                  >
                    {/* Icon & Details */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                          isPinned
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {title}
                        </div>
                        {description && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {description}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Star / Pin Action */}
                    <button
                      type="button"
                      onClick={(e) => togglePin(item.id, e)}
                      title={
                        isPinned
                          ? isAr
                            ? "إلغاء التثبيت من الشريط الجانبي"
                            : "Unpin from sidebar"
                          : isAr
                            ? "تثبيت في الشريط الجانبي"
                            : "Pin to sidebar"
                      }
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isPinned
                          ? "text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                          : "text-muted-foreground/40 hover:text-amber-500 hover:bg-muted",
                      )}
                      aria-label={
                        isPinned
                          ? isAr
                            ? "إلغاء التثبيت"
                            : "Unpin"
                          : isAr
                            ? "تثبيت"
                            : "Pin"
                      }
                    >
                      <Star
                        className={cn(
                          "h-4 w-4 transition-transform group-hover:scale-110",
                          isPinned ? "fill-amber-500 text-amber-500" : "",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 px-5 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            <span>
              {isAr ? `المثبتة في شريطك: ${pinnedCount}` : `Pinned: ${pinnedCount}`}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 px-3 text-xs"
          >
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
