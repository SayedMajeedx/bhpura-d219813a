import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Search,
  Pin,
  PinOff,
  ExternalLink,
  Layers,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
  AppWindow,
  Boxes,
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

type CategoryTab = "all" | "operations" | "growth_finance" | "storefront_settings";

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

  const togglePin = (itemId: string) => {
    setPinnedIds((prev) => {
      const isPinned = prev.includes(itemId);
      const next = isPinned ? prev.filter((id) => id !== itemId) : [...prev, itemId];
      if (activeSlug && typeof window !== "undefined") {
        try {
          localStorage.setItem(`boutq_pinned_nav_${activeSlug}`, JSON.stringify(next));
          // Dispatch storage event so other components (OsSidebar) re-sync immediately
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

  // Categories config
  const categories = [
    { id: "all" as const, label: isAr ? "كافة الأدوات" : "All Tools", count: modularItems.length },
    {
      id: "operations" as const,
      label: isAr ? "العمليات والمخزون" : "Operations & Catalog",
      count: modularItems.filter((i) => i.section === "operations").length,
    },
    {
      id: "growth_finance" as const,
      label: isAr ? "التسويق والمالية" : "Growth & Finance",
      count: modularItems.filter((i) => i.section === "growth_finance").length,
    },
    {
      id: "storefront_settings" as const,
      label: isAr ? "المتجر والإدارة" : "Storefront & Team",
      count: modularItems.filter((i) => i.section === "storefront_settings").length,
    },
  ];

  // Filtered items
  const filteredItems = React.useMemo(() => {
    return modularItems.filter((item) => {
      // Category match
      if (selectedCategory !== "all" && item.section !== selectedCategory) {
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
  }, [modularItems, selectedCategory, searchQuery]);

  const handleLaunch = (item: AdminNavItemConfig) => {
    onOpenChange(false);
    navigate({
      to: item.to as any,
      params: item.params as any,
      search: (item.id === "campaigns" ? { segment: "All" } : undefined) as any,
    });
  };

  const getSectionBadge = (section: string) => {
    switch (section) {
      case "operations":
        return {
          label: isAr ? "العمليات" : "Operations",
          color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        };
      case "growth_finance":
        return {
          label: isAr ? "النمو والمالية" : "Growth & Finance",
          color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        };
      case "storefront_settings":
        return {
          label: isAr ? "المتجر والإدارة" : "Store & Admin",
          color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        };
      default:
        return {
          label: isAr ? "أداة" : "Tool",
          color: "bg-muted text-muted-foreground border-border",
        };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden border border-[var(--os-border)] shadow-2xl rounded-[var(--os-radius-panel)] bg-card text-foreground">
        {/* Header with Title & Live Search */}
        <DialogHeader className="p-5 pb-4 border-b border-[var(--os-border)] bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-amber-500/15 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold font-heading text-foreground flex items-center gap-2">
                  <span>{isAr ? "مركز التطبيقات والأدوات" : "Apps & Tools Hub"}</span>
                  <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5">
                    {modularItems.length} {isAr ? "أداة إضافية" : "Modular Tools"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "استعرض كافة الأدوات المتقدمة في Boutq OS، تعرف على دور كل أداة، وقم بتثبيتها أو إزالتها من شريطك الجانبي."
                    : "Explore advanced boutique tools, read short guides, and pin/unpin them to your active sidebar."}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mt-4">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? "ابحث باسم الأداة أو وظيفتها (مثل: المرتجعات، واتساب، الخصومات، الموظفين...)"
                  : "Search tool by name or function (e.g. returns, whatsapp, discounts, team...)"
              }
              className="ps-9 h-10 text-xs bg-background/80 border-border/80 rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 -translate-y-1/2 end-3 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-3 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border",
                  selectedCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground border-border/50",
                )}
              >
                <span>{cat.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    selectedCategory === cat.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* Tools Cards Grid */}
        <div className="flex-1 p-5 overflow-y-auto os-scrollbar">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Boxes className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm font-semibold text-foreground">
                {isAr ? "لم يتم العثور على أي أدوات مطابقة" : "No matching tools found"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "جرب البحث بكلمات أخرى أو اختر تبويباً مختلفاً."
                  : "Try searching with different keywords or switch categories."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredItems.map((item) => {
                const Icon = item.icon;
                const isPinned = pinnedIds.includes(item.id);
                const title = isAr ? item.labelAr : item.labelEn;
                const description = isAr
                  ? item.descriptionAr || "أداة متقدمة لإدارة عمليات وتوسع المتجر."
                  : item.descriptionEn || "Advanced module for boutique operations & growth.";
                const badge = getSectionBadge(item.section);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 shadow-2xs hover:shadow-md",
                      isPinned
                        ? "bg-primary/5 border-primary/30 dark:bg-primary/10"
                        : "bg-card hover:bg-muted/30 border-border/60",
                    )}
                  >
                    {/* Top Row: Icon + Badge + Pin Action */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center border transition-transform group-hover:scale-105 shrink-0",
                              isPinned
                                ? "bg-primary text-primary-foreground border-primary/40 shadow-xs"
                                : "bg-muted/80 text-foreground border-border/60",
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold font-heading text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                              <span>{title}</span>
                              {isPinned && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-normal text-primary font-sans">
                                  <Pin className="h-2.5 w-2.5 fill-current" />
                                </span>
                              )}
                            </h3>
                            <span
                              className={cn(
                                "inline-block text-[10px] font-semibold px-2 py-0.2 rounded-md border mt-0.5",
                                badge.color,
                              )}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>

                        {/* Pin / Unpin Action Toggle */}
                        <Button
                          type="button"
                          variant={isPinned ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => togglePin(item.id)}
                          className={cn(
                            "h-8 px-2.5 text-xs font-semibold rounded-xl gap-1.5 transition-all",
                            isPinned
                              ? "bg-primary/15 hover:bg-destructive/15 text-primary hover:text-destructive border-primary/30 hover:border-destructive/30"
                              : "hover:bg-primary/10 hover:text-primary",
                          )}
                          title={
                            isPinned
                              ? isAr
                                ? "إلغاء التثبيت من الشريط الجانبي"
                                : "Unpin from sidebar"
                              : isAr
                                ? "تثبيت في الشريط الجانبي"
                                : "Pin to sidebar"
                          }
                        >
                          {isPinned ? (
                            <>
                              <PinOff className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">
                                {isAr ? "إلغاء التثبيت" : "Unpin"}
                              </span>
                            </>
                          ) : (
                            <>
                              <Pin className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">
                                {isAr ? "تثبيت بالشريط" : "Pin"}
                              </span>
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Tool Short Description */}
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>

                    {/* Footer Launch Button */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        {isPinned ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {isAr ? "مثبت في الشريط الجانبي" : "Pinned to sidebar"}
                          </span>
                        ) : (
                          <span>{isAr ? "متاح في أي وقت" : "Available anytime"}</span>
                        )}
                      </span>

                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() => handleLaunch(item)}
                        className="h-7.5 px-3 text-xs font-semibold gap-1.5 rounded-lg shadow-2xs"
                      >
                        <span>{isAr ? "فتح الأداة" : "Open Tool"}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-3.5 border-t border-[var(--os-border)] bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>
              {isAr
                ? "الأدوات المثبتة تظهر مباشرة في الشريط الجانبي وشريط التطبيقات لتسهيل وصولك اليومي."
                : "Pinned tools appear directly on your sidebar and app dock for quick access."}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 px-4 text-xs font-semibold rounded-xl"
          >
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
