import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Search,
  Pin,
  PinOff,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  Boxes,
  Zap,
  Sliders,
  ChevronRight,
  Layers,
  Star,
  Compass,
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
import { Badge } from "@/components/ui/badge";
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

type CategoryTab = "all" | "operations" | "growth_finance" | "storefront_settings" | "pinned";

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
      label: isAr ? "كافة الأدوات" : "All Tools",
      count: modularItems.length,
      icon: Compass,
    },
    {
      id: "pinned" as const,
      label: isAr ? "المثبتة فقط" : "Pinned Only",
      count: pinnedCount,
      icon: Star,
    },
    {
      id: "operations" as const,
      label: isAr ? "العمليات والمخزون" : "Operations",
      count: modularItems.filter((i) => i.section === "operations").length,
      icon: Boxes,
    },
    {
      id: "growth_finance" as const,
      label: isAr ? "التسويق والمالية" : "Growth & Finance",
      count: modularItems.filter((i) => i.section === "growth_finance").length,
      icon: Zap,
    },
    {
      id: "storefront_settings" as const,
      label: isAr ? "المتجر والفريق" : "Store & Team",
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

  const getSectionMeta = (section: string) => {
    switch (section) {
      case "operations":
        return {
          label: isAr ? "العمليات" : "Operations",
          badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
          iconBg: "bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-indigo-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
        };
      case "growth_finance":
        return {
          label: isAr ? "النمو والمالية" : "Growth & Finance",
          badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
          iconBg: "bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        };
      case "storefront_settings":
        return {
          label: isAr ? "المتجر والإدارة" : "Store & Admin",
          badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
          iconBg: "bg-gradient-to-br from-purple-500/20 via-purple-500/10 to-indigo-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
        };
      default:
        return {
          label: isAr ? "أداة متقدمة" : "Modular Tool",
          badgeClass: "bg-muted text-muted-foreground border-border",
          iconBg: "bg-muted/80 text-foreground border-border/60",
        };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden border border-[var(--os-border)] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.35)] rounded-3xl bg-card text-foreground backdrop-blur-2xl">
        {/* Ambient Top Glow */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Header with Title & Live Search */}
        <DialogHeader className="p-6 pb-4 border-b border-[var(--os-border)] bg-muted/20 relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Title & Brand Icon */}
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-amber-700 text-primary-foreground font-bold font-heading text-base flex items-center justify-center shadow-lg shadow-primary/20 border border-primary/30 shrink-0">
                <Boxes className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold font-heading text-foreground flex items-center gap-2.5">
                  <span>{isAr ? "مركز الأدوات والتطبيقات" : "Apps & Extensions Hub"}</span>
                  <span className="text-[11px] font-semibold font-sans px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    Boutq OS
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {isAr
                    ? "استكشف كافة الأدوات المتقدمة لمتجرك، اقرأ نبذة عن دور كل أداة، وخصص شريطك الجانبي بتثبيت ما تحتاجه يومياً."
                    : "Explore advanced boutique modules, understand their functions, and personalize your active sidebar navigation."}
                </DialogDescription>
              </div>
            </div>

            {/* Quick Stats Pill */}
            <div className="hidden sm:flex items-center gap-2 bg-background/80 border border-border/70 px-3.5 py-1.5 rounded-2xl shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                <span>
                  {pinnedCount} {isAr ? "مثبتة في شريطك" : "pinned"}
                </span>
              </div>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-xs text-muted-foreground">
                {modularItems.length} {isAr ? "أداة متاحة" : "total"}
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3.5 h-4 w-4 text-muted-foreground transition-colors" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? "ابحث باسم الأداة أو دورها (مثال: المرتجعات، واتساب، الخصومات، الموظفين، الحاضنات...)"
                  : "Search module by name or function (e.g. returns, whatsapp, discounts, team...)"
              }
              className="ps-10 pe-10 h-11 text-xs sm:text-sm bg-background/90 border-border/80 rounded-2xl shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 -translate-y-1/2 end-3.5 h-6 w-6 rounded-full bg-muted/80 hover:bg-muted text-xs text-muted-foreground hover:text-foreground flex items-center justify-center transition-all"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-2 border shadow-2xs active:scale-95",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                      : "bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", isSelected ? "text-primary-foreground" : "text-primary")} />
                  <span>{cat.label}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold",
                      isSelected
                        ? "bg-primary-foreground/25 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogHeader>

        {/* Tools Cards Grid */}
        <div className="flex-1 p-6 overflow-y-auto os-scrollbar relative z-10">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center mx-auto text-muted-foreground shadow-inner">
                <Boxes className="h-7 w-7 opacity-60" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {isAr ? "لم يتم العثور على أي أدوات مطابقة" : "No matching modules found"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  {isAr
                    ? "جرب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً من القائمة أعلاه."
                    : "Try searching with different keywords or select another category."}
                </p>
              </div>
              {searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="rounded-xl text-xs"
                >
                  {isAr ? "مسح البحث" : "Clear search"}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredItems.map((item) => {
                const Icon = item.icon;
                const isPinned = pinnedIds.includes(item.id);
                const title = isAr ? item.labelAr : item.labelEn;
                const description = isAr
                  ? item.descriptionAr || "أداة متقدمة لإدارة عمليات وتوسع المتجر."
                  : item.descriptionEn || "Advanced module for boutique operations & growth.";
                const meta = getSectionMeta(item.section);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleLaunch(item)}
                    className={cn(
                      "group relative p-4.5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-4 cursor-pointer select-none",
                      isPinned
                        ? "bg-gradient-to-br from-primary/5 via-card to-background border-primary/30 dark:border-primary/40 shadow-xs hover:shadow-md hover:border-primary/60 hover:-translate-y-0.5"
                        : "bg-card hover:bg-muted/30 border-border/70 hover:border-border hover:shadow-md hover:-translate-y-0.5",
                    )}
                  >
                    {/* Header: Icon, Title, Badge & Pin Toggle */}
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Rich Icon Container */}
                          <div
                            className={cn(
                              "h-11 w-11 rounded-2xl flex items-center justify-center border transition-all duration-300 group-hover:scale-105 shrink-0 shadow-2xs",
                              isPinned
                                ? "bg-primary text-primary-foreground border-primary/40 shadow-sm shadow-primary/25"
                                : meta.iconBg,
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>

                          {/* Titles & Category Tag */}
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold font-heading text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 truncate">
                              <span className="truncate">{title}</span>
                              {isPinned && (
                                <span className="inline-flex items-center text-[10px] text-primary shrink-0" title={isAr ? "مثبتة في شريطك" : "Pinned"}>
                                  <Pin className="h-3 w-3 fill-current" />
                                </span>
                              )}
                            </h3>
                            <span
                              className={cn(
                                "inline-block text-[10px] font-semibold px-2 py-0.2 rounded-md border mt-1",
                                meta.badgeClass,
                              )}
                            >
                              {meta.label}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Pin / Unpin Button */}
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
                            "h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all duration-200 shrink-0",
                            isPinned
                              ? "bg-primary/10 hover:bg-destructive/15 text-primary hover:text-destructive border-primary/25 hover:border-destructive/30"
                              : "bg-muted/60 hover:bg-primary/10 text-muted-foreground hover:text-primary border-border/70 hover:border-primary/30",
                          )}
                        >
                          {isPinned ? (
                            <>
                              <PinOff className="h-3.5 w-3.5" />
                              <span className="text-[11px]">
                                {isAr ? "مثبتة 📌" : "Pinned"}
                              </span>
                            </>
                          ) : (
                            <>
                              <Pin className="h-3.5 w-3.5" />
                              <span className="text-[11px]">
                                {isAr ? "تثبيت" : "Pin"}
                              </span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Tool Meaningful Explanation */}
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {description}
                      </p>
                    </div>

                    {/* Footer: Live Status & Launch Action */}
                    <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {isPinned ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>{isAr ? "نشطة في الشريط الجانبي" : "Active in sidebar"}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/80">
                            {isAr ? "متاحة للتثبيت" : "Ready to pin"}
                          </span>
                        )}
                      </div>

                      <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform">
                        <span>{isAr ? "فتح الأداة" : "Open Module"}</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-4 px-6 border-t border-[var(--os-border)] bg-muted/30 backdrop-blur-md flex items-center justify-between text-xs text-muted-foreground relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-relaxed">
              {isAr
                ? "أي أداة تثبتها تظهر فوراً في شريطك الجانبي للوصول السريع بدون الحاجة لإعادة تحميل الصفحة."
                : "Pinned tools appear instantly in your sidebar and dock for fast 1-click access."}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8.5 px-4 text-xs font-semibold rounded-xl border-border/80 shadow-2xs"
          >
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
