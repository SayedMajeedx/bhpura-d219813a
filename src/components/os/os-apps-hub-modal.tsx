import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Search,
  Compass,
  Boxes,
  Zap,
  Sliders,
  X,
  Layers,
  Wallet,
  Puzzle,
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
} from "@/config/admin-navigation";

export interface OsAppsHubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  lang: "en" | "ar";
  onPinnedChange?: (pinnedIds: string[]) => void;
}

type CategoryTab =
  | "all"
  | "operations"
  | "catalog"
  | "growth"
  | "finance"
  | "store_setup";

export function OsAppsHubModal({
  open,
  onOpenChange,
  activeSlug,
  navItems,
  lang,
}: OsAppsHubModalProps) {
  const isAr = lang === "ar";
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<CategoryTab>("all");

  // Modular items only (tier === 'modular' or unassigned to core)
  const modularItems = React.useMemo(() => {
    return navItems.filter((item) => {
      if (item.tier === "modular") return true;
      if (item.id === "dashboard") return false;
      return true;
    });
  }, [navItems]);

  // Categories config
  const categories = [
    {
      id: "all" as const,
      label: isAr ? "الكل" : "All",
      count: modularItems.length,
      icon: Compass,
    },
    {
      id: "operations" as const,
      label: isAr ? "العمليات والطلبات" : "Operations",
      count: modularItems.filter((i) => (i.workspace || i.category) === "operations").length,
      icon: Layers,
    },
    {
      id: "catalog" as const,
      label: isAr ? "الكتالوج والمخزون" : "Catalog & Stock",
      count: modularItems.filter((i) => (i.workspace || i.category) === "catalog").length,
      icon: Boxes,
    },
    {
      id: "growth" as const,
      label: isAr ? "العملاء والنمو" : "Customers & Growth",
      count: modularItems.filter((i) => (i.workspace || i.category) === "growth").length,
      icon: Zap,
    },
    {
      id: "finance" as const,
      label: isAr ? "المالية والتقارير" : "Finance & Reports",
      count: modularItems.filter((i) => (i.workspace || i.category) === "finance").length,
      icon: Wallet,
    },
    {
      id: "store_setup" as const,
      label: isAr ? "إعداد المتجر" : "Store Setup",
      count: modularItems.filter((i) => (i.workspace || i.category) === "store_setup").length,
      icon: Sliders,
    },
  ];

  // Filtered items
  const filteredItems = React.useMemo(() => {
    return modularItems.filter((item) => {
      // Category match
      if (selectedCategory !== "all") {
        if ((item.workspace || item.category) !== selectedCategory) {
          return false;
        }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="flex h-[calc(100dvh-2rem)] max-h-[760px] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-[24px] border-border-strong bg-background p-0 text-foreground shadow-2xl sm:w-[calc(100vw-3rem)]"
      >
        <DialogHeader className="border-b border-border-strong px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
                {isAr ? "دليل مساحات العمل والأدوات" : "Workspaces & Tools Directory"}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {isAr
                  ? "دليل شامل لجميع مساحات العمل والأدوات التشغيلية في متجرك."
                  : "Comprehensive directory for all workspaces and operational tools in your store."}
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
              className="h-12 rounded-xl border-border-strong bg-muted/25 pe-11 ps-11 text-sm shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/15"
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
          <aside className="shrink-0 border-b border-border-strong bg-muted/15 p-3 md:w-60 md:border-b-0 md:border-e md:p-4">
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
                      "flex h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors md:w-full",
                      isSelected
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/70"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isSelected && "text-primary")} />
                    <span>{cat.label}</span>
                    <span className="ms-auto min-w-5 rounded-md bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground">
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
            {activeSlug && (
              <div className="mt-4 pt-3 border-t border-border-strong hidden md:block">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    navigate({
                      to: "/admin/b/$slug/addons" as any,
                      params: { slug: activeSlug } as any,
                    });
                  }}
                  className="w-full justify-start gap-2 h-10 text-xs rounded-xl border-border bg-background hover:bg-muted font-medium text-foreground"
                >
                  <Puzzle className="h-4 w-4 text-primary shrink-0" />
                  <span>{isAr ? "متجر الإضافات" : "Add-ons Store"}</span>
                </Button>
              </div>
            )}
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
                      className="group relative flex min-h-24 cursor-pointer items-start gap-4 rounded-2xl border border-border-strong bg-card p-4 text-start shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold leading-6 text-foreground">{title}</h4>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary rtl:rotate-[-90deg]" />
                        </div>
                        {description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>

        <footer className="flex min-h-14 items-center justify-between border-t border-border-strong bg-background px-5 sm:px-7">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Compass className="h-3.5 w-3.5 text-primary" />
            {isAr
              ? "اختر أي أداة للانتقال الفوري إلى مساحة العمل الخاصة بها"
              : "Select any tool to navigate directly to its workspace"}
          </p>
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
