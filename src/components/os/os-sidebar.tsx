import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Store,
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
  ChevronDown,
  Sparkles,
  Search,
  Grid,
  Boxes,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OsNavItem } from "./os-nav-item";
import { OsBrandSwitcher, type BrandRow } from "./os-brand-switcher";
import { OsAppsHubModal } from "./os-apps-hub-modal";
import {
  DEFAULT_PINNED_IDS,
  type AdminNavItemConfig,
} from "@/config/admin-navigation";

export interface OsSidebarProps {
  brandLabel: string;
  brandSubtitle: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  isSuperAdmin: boolean;
  isCourier: boolean;
  brands: BrandRow[];
  collapsed: boolean;
  collapsible?: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function OsSidebar({
  brandLabel,
  brandSubtitle,
  activeSlug,
  navItems,
  pathname,
  lang,
  isSuperAdmin,
  isCourier,
  brands,
  collapsed,
  collapsible = true,
  onToggleCollapse,
  className,
}: OsSidebarProps) {
  const isAr = lang === "ar";
  const [appsDrawerOpen, setAppsDrawerOpen] = React.useState(false);
  const [appsHubModalOpen, setAppsHubModalOpen] = React.useState(false);
  const [filterQuery, setFilterQuery] = React.useState("");

  // Pinned items state persisted per-brand in localStorage
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

  // Re-sync when activeSlug changes or custom event dispatched
  React.useEffect(() => {
    if (!activeSlug || typeof window === "undefined") return;

    const reloadPinned = () => {
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
    };

    reloadPinned();
    window.addEventListener("boutq-pinned-nav-updated", reloadPinned);
    window.addEventListener("storage", reloadPinned);
    return () => {
      window.removeEventListener("boutq-pinned-nav-updated", reloadPinned);
      window.removeEventListener("storage", reloadPinned);
    };
  }, [activeSlug]);

  const togglePin = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
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
      return next;
    });
  };

  // Group items
  const isPlatformMode = !activeSlug && isSuperAdmin;

  // Split into core vs modular
  const coreItems = React.useMemo(() => {
    if (isPlatformMode || isCourier) return navItems;
    return navItems.filter((i) => i.tier === "core" || (!i.tier && !i.adminOnly));
  }, [navItems, isPlatformMode, isCourier]);

  const modularItems = React.useMemo(() => {
    if (isPlatformMode || isCourier) return [];
    return navItems.filter((i) => i.tier === "modular");
  }, [navItems, isPlatformMode, isCourier]);

  // Find currently active item
  const activeModularItem = React.useMemo(() => {
    return modularItems.find((item) => {
      const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
      return pathname.startsWith(targetPath);
    });
  }, [modularItems, pathname]);

  // Items to show in the pinned/active section
  const visibleModularItems = React.useMemo(() => {
    if (isPlatformMode || isCourier) return [];
    const items = modularItems.filter((i) => pinnedIds.includes(i.id));
    // Always include active item even if not pinned
    if (activeModularItem && !items.some((i) => i.id === activeModularItem.id)) {
      items.push(activeModularItem);
    }
    return items;
  }, [modularItems, pinnedIds, activeModularItem, isPlatformMode, isCourier]);

  // Filtered modular items in the Apps Drawer
  const filteredModularItems = React.useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return modularItems;
    return modularItems.filter((i) => {
      return (
        i.labelEn.toLowerCase().includes(q) ||
        i.labelAr.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      );
    });
  }, [modularItems, filterQuery]);

  return (
    <>
      <aside
        className={cn(
          "no-print hidden md:flex flex-col shrink-0 border border-[var(--os-border)] os-glass-strong shadow-xl transition-all duration-300 relative z-20 my-3 ms-3 rounded-[var(--os-radius-panel)] overflow-hidden select-none",
          collapsed ? "w-20" : "w-64",
          className,
        )}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-[var(--os-border)] flex items-center justify-between gap-2 bg-card/30">
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <span className="text-xl font-bold font-heading text-foreground truncate leading-tight block">
                {brandLabel}
              </span>
              <p className="text-[11px] text-muted-foreground truncate">{brandSubtitle}</p>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold font-heading text-base shadow-sm">
              {brandLabel.slice(0, 2).toUpperCase()}
            </div>
          )}

          {collapsible && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="h-7 w-7 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors shrink-0 outline-none os-focus-ring"
              title={
                collapsed
                  ? isAr
                    ? "توسيع الشريط"
                    : "Expand sidebar"
                  : isAr
                    ? "طي الشريط"
                    : "Collapse sidebar"
              }
            >
              {collapsed ? (
                isAr ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )
              ) : isAr ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Super Admin Switcher */}
        {isSuperAdmin && (
          <OsBrandSwitcher
            activeSlug={activeSlug}
            brands={brands}
            lang={lang}
            pathname={pathname}
            collapsed={collapsed}
          />
        )}

        {/* View Storefront Quick Button */}
        {activeSlug && !isCourier && !collapsed && (
          <div className="px-3 pt-3">
            <a
              href={
                typeof window !== "undefined" &&
                window.location.hostname.toLowerCase() !== "localhost" &&
                window.location.hostname.toLowerCase() !== "127.0.0.1"
                  ? `https://${activeSlug}.boutq.store`
                  : `/${activeSlug}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-foreground/90 bg-muted/40 border border-[var(--os-border)] rounded-xl hover:bg-muted/80 transition-all shadow-2xs"
            >
              <Store className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? "عرض المتجر" : "View Storefront"}</span>
            </a>
          </div>
        )}

        {/* Main Nav List */}
        <nav className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-none">
          {/* Core Daily Essentials */}
          <div className="space-y-1">
            {!collapsed && (
              <div className="flex items-center justify-between px-3 mt-1 mb-1.5">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  {isAr ? "الأساسيات" : "CORE"}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {coreItems.map((item) => {
                const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                const active = pathname.startsWith(targetPath);
                const label = isAr ? item.labelAr : item.labelEn;

                return (
                  <Link
                    key={item.id}
                    to={item.to as any}
                    params={item.params as any}
                    preload="intent"
                    className="block"
                  >
                    <OsNavItem
                      icon={item.icon}
                      label={label}
                      active={active}
                      collapsed={collapsed}
                      badge={item.badge}
                    />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Pinned & Active Modular Tools */}
          {visibleModularItems.length > 0 && (
            <div className="space-y-1 pt-1">
              {!collapsed && (
                <div className="flex items-center justify-between px-3 mt-2 mb-1.5">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase flex items-center gap-1.5">
                    <Pin className="h-2.5 w-2.5 text-primary" />
                    <span>{isAr ? "الأدوات المثبتة" : "PINNED TOOLS"}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 font-semibold">
                    {visibleModularItems.length}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                {visibleModularItems.map((item) => {
                  const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                  const active = pathname.startsWith(targetPath);
                  const label = isAr ? item.labelAr : item.labelEn;
                  const isPinned = pinnedIds.includes(item.id);

                  return (
                    <div key={item.id} className="relative group">
                      <Link
                        to={item.to as any}
                        params={item.params as any}
                        preload="intent"
                        className="block"
                      >
                        <OsNavItem
                          icon={item.icon}
                          label={label}
                          active={active}
                          collapsed={collapsed}
                          badge={item.badge}
                        />
                      </Link>

                      {/* Quick Unpin Icon on hover */}
                      {!collapsed && (
                        <button
                          type="button"
                          onClick={(e) => togglePin(item.id, e)}
                          title={
                            isPinned
                              ? isAr
                                ? "إلغاء التثبيت من القائمة"
                                : "Unpin from sidebar"
                              : isAr
                                ? "تثبيت في القائمة"
                                : "Pin to sidebar"
                          }
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 end-2.5 h-6 w-6 rounded-md flex items-center justify-center transition-opacity",
                            isPinned
                              ? "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              : "opacity-100 text-primary hover:bg-primary/10",
                          )}
                        >
                          {isPinned ? (
                            <PinOff className="h-3 w-3" />
                          ) : (
                            <Pin className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Progressive Disclosure: More Tools & Apps Drawer Trigger */}
        {modularItems.length > 0 && (
          <div className="p-2.5 border-t border-[var(--os-border)] bg-card/20">
            {!collapsed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAppsDrawerOpen(!appsDrawerOpen)}
                    className={cn(
                      "flex-1 flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 shadow-2xs",
                      appsDrawerOpen
                        ? "bg-primary/10 border-primary/30 text-primary font-bold"
                        : "bg-muted/40 hover:bg-muted/70 border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Grid className="h-3.5 w-3.5 text-primary" />
                      <span>{isAr ? "كافة الأدوات" : "All Apps & Tools"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground">
                        {modularItems.length}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-200",
                          appsDrawerOpen && "rotate-180",
                        )}
                      />
                    </div>
                  </button>

                  {/* Open Rich Apps Hub Modal */}
                  <button
                    type="button"
                    onClick={() => setAppsHubModalOpen(true)}
                    title={isAr ? "فتح مركز التطبيقات ودليل الأدوات" : "Open Apps Hub & Guide"}
                    className="h-8.5 w-8.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 flex items-center justify-center transition-all hover:scale-105 shrink-0 shadow-2xs"
                  >
                    <Boxes className="h-4 w-4" />
                  </button>
                </div>

                {/* Expandable Apps Tray */}
                {appsDrawerOpen && (
                  <div className="space-y-2 max-h-64 overflow-y-auto p-1.5 rounded-xl border border-border/60 bg-background/95 shadow-inner backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
                    {/* Search Filter */}
                    <div className="relative">
                      <Search className="absolute top-1/2 -translate-y-1/2 start-2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder={isAr ? "ابحث عن أداة..." : "Search tool..."}
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        className="w-full ps-7 pe-2 py-1 text-[11px] rounded-lg bg-muted/60 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* List of tools with Pin toggles */}
                    <div className="space-y-0.5">
                      {filteredModularItems.map((item) => {
                        const Icon = item.icon;
                        const isPinned = pinnedIds.includes(item.id);
                        const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                        const active = pathname.startsWith(targetPath);
                        const label = isAr ? item.labelAr : item.labelEn;

                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-colors group",
                              active
                                ? "bg-primary text-primary-foreground font-bold"
                                : "text-foreground hover:bg-muted/70",
                            )}
                          >
                            <Link
                              to={item.to as any}
                              params={item.params as any}
                              onClick={() => setAppsDrawerOpen(false)}
                              className="flex items-center gap-2 flex-1 truncate"
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{label}</span>
                            </Link>

                            <button
                              type="button"
                              onClick={(e) => togglePin(item.id, e)}
                              title={
                                isPinned
                                  ? isAr
                                    ? "إلغاء التثبيت"
                                    : "Unpin"
                                  : isAr
                                    ? "تثبيت في القائمة"
                                    : "Pin to sidebar"
                              }
                              className={cn(
                                "h-5 w-5 rounded flex items-center justify-center transition-colors shrink-0",
                                isPinned
                                  ? "text-primary hover:text-destructive"
                                  : "text-muted-foreground hover:text-primary",
                                active && "text-primary-foreground hover:text-primary-foreground/80",
                              )}
                            >
                              <Pin
                                className={cn(
                                  "h-3 w-3",
                                  isPinned ? "fill-current" : "fill-none stroke-[2]",
                                )}
                              />
                            </button>
                          </div>
                        );
                      })}

                      {filteredModularItems.length === 0 && (
                        <p className="text-[11px] text-center text-muted-foreground py-2">
                          {isAr ? "لا توجد أدوات مطابقة" : "No matching tools found"}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setAppsHubModalOpen(true)}
                  title={isAr ? "مركز التطبيقات والأدوات" : "All Apps & Tools Hub"}
                  className="h-9 w-9 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-all shadow-2xs border border-primary/20"
                >
                  <Boxes className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Apps Hub Modal */}
      {activeSlug && !isCourier && (
        <OsAppsHubModal
          open={appsHubModalOpen}
          onOpenChange={setAppsHubModalOpen}
          activeSlug={activeSlug}
          navItems={navItems}
          lang={lang}
        />
      )}
    </>
  );
}
