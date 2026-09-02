import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Search, Star, Compass, Boxes, Zap, Sliders, X, Layers } from "lucide-react";
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
import { type AdminNavItemConfig, DEFAULT_PINNED_IDS } from "@/config/admin-navigation";

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
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="flex h-[min(760px,88vh)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-[24px] border-border/70 bg-background p-0 text-foreground shadow-2xl sm:w-[calc(100vw-3rem)]"
      >
        <DialogHeader className="border-b border-border/70 px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
                {isAr ? "الأدوات والتطبيقات" : "Apps and tools"}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {isAr
                  ? "كل ما تحتاجه لإدارة المتجر، في مكان واحد. ثبّت أدواتك الأكثر استخداماً للوصول إليها بسرعة."
                  : "Everything you need to run your store in one place. Pin your most-used tools for faster access."}
              </DialogDescription>
            </div>
          </div>

          <div className="relative mt-5">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "ابحث باسم الأداة أو وظيفتها" : "Search by tool name or function"}
              className="h-12 rounded-xl border-border/80 bg-muted/25 pe-11 ps-11 text-sm shadow-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute end-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={isAr ? "مسح البحث" : "Clear search"}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="shrink-0 border-b border-border/70 bg-muted/15 p-3 md:w-56 md:border-b-0 md:border-e md:p-4">
            <div className="flex gap-1 overflow-x-auto scrollbar-none md:flex-col md:overflow-visible">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors md:w-full",
                      isSelected
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/70"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isSelected && "text-primary")} />
                    <span>{cat.label}</span>
                    <span className="ms-auto min-w-5 rounded-md bg-muted px-1.5 py-0.5 text-center font-mono text-[10px] text-muted-foreground">
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 hidden rounded-xl border border-border/60 bg-background/70 p-3 md:block">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                {isAr ? `${pinnedCount} أدوات مثبتة` : `${pinnedCount} pinned tools`}
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                {isAr
                  ? "تظهر الأدوات المثبتة مباشرة في الشريط الجانبي."
                  : "Pinned tools appear directly in your sidebar."}
              </p>
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {categories.find((category) => category.id === selectedCategory)?.label}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isAr
                    ? `${filteredItems.length} ${filteredItems.length === 1 ? "أداة" : "أدوات"}`
                    : `${filteredItems.length} ${filteredItems.length === 1 ? "tool" : "tools"}`}
                </p>
              </div>
              {searchQuery && (
                <span className="max-w-52 truncate text-xs text-muted-foreground">
                  {isAr ? `نتائج «${searchQuery}»` : `Results for “${searchQuery}”`}
                </span>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-6 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Search className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-semibold">
                  {isAr ? "لم نجد أداة بهذا الاسم" : "No tools found"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {isAr ? "جرّب كلمة مختلفة أو اختر تصنيفاً آخر." : "Try another term or category."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredItems.map((item) => {
                  const Icon = item.icon;
                  const isPinned = pinnedIds.includes(item.id);
                  const title = isAr ? item.labelAr : item.labelEn;
                  const description = isAr ? item.descriptionAr || "" : item.descriptionEn || "";

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleLaunch(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleLaunch(item);
                        }
                      }}
                      className="group relative flex min-h-28 cursor-pointer items-start gap-4 rounded-2xl border border-border/70 bg-card p-4 text-start shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 pe-7">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold leading-6 text-foreground">{title}</h4>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary rtl:rotate-[-90deg]" />
                        </div>
                        {description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {description}
                          </p>
                        )}
                      </div>
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
                          "absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          isPinned
                            ? "bg-amber-50 text-amber-500 dark:bg-amber-500/10"
                            : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
                        )}
                        aria-label={
                          isPinned ? (isAr ? "إلغاء التثبيت" : "Unpin") : isAr ? "تثبيت" : "Pin"
                        }
                      >
                        <Star className={cn("h-4 w-4", isPinned && "fill-current")} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>

        <footer className="flex min-h-14 items-center justify-between border-t border-border/70 bg-background px-5 sm:px-7">
          <p className="text-xs text-muted-foreground md:hidden">
            {isAr ? `${pinnedCount} أدوات مثبتة` : `${pinnedCount} pinned tools`}
          </p>
          <div className="hidden md:block" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg px-4 text-xs font-semibold"
          >
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
