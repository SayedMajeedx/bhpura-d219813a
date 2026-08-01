import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Store, Grid, PanelLeftOpen, X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { OsBrandSwitcher, type BrandRow } from "./os-brand-switcher";
import { type AdminNavItemConfig } from "@/config/admin-navigation";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "@/components/ui/sheet";

export interface OsAppDockRailProps {
  brandLabel: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  isSuperAdmin: boolean;
  isCourier: boolean;
  brands: BrandRow[];
  onExpandSidebar?: () => void;
  className?: string;
}

// App Drawer Gradient Icon Map & Descriptions
const APP_CONFIG_MAP: Record<string, { gradient: string; descAr: string; descEn: string }> = {
  campaigns: {
    gradient: "from-rose-500 via-rose-600 to-amber-600",
    descAr: "حملات الواتساب والتسويق",
    descEn: "WhatsApp & Campaigns",
  },
  discounts: {
    gradient: "from-amber-500 via-amber-600 to-yellow-600",
    descAr: "أكواد الخصم والعروض",
    descEn: "Discounts & Promo Codes",
  },
  expenses: {
    gradient: "from-emerald-500 via-emerald-600 to-teal-700",
    descAr: "إدارة المصاريف والنفقات",
    descEn: "Expenses & Operating Costs",
  },
  integrations: {
    gradient: "from-violet-500 via-indigo-600 to-purple-700",
    descAr: "ربط المطورين والـ API",
    descEn: "Developer & API Keys",
  },
  communications: {
    gradient: "from-blue-500 via-sky-600 to-cyan-600",
    descAr: "سجل الرسائل والإشعارات",
    descEn: "Messages & Webhooks",
  },
  pages: {
    gradient: "from-slate-600 via-slate-700 to-zinc-800",
    descAr: "صفحات المتجر والسياسات",
    descEn: "Store Pages & Policies",
  },
  team: {
    gradient: "from-indigo-600 via-purple-600 to-violet-800",
    descAr: "إدارة الموظفين والصلاحيات",
    descEn: "Staff & Role Access",
  },
  categories: {
    gradient: "from-amber-600 via-orange-600 to-rose-700",
    descAr: "تصنيفات وأقسام المتجر",
    descEn: "Product Categories",
  },
};

export function OsAppDockRail({
  brandLabel,
  activeSlug,
  navItems,
  pathname,
  lang,
  isSuperAdmin,
  isCourier,
  brands,
  onExpandSidebar,
  className,
}: OsAppDockRailProps) {
  const [launcherOpen, setLauncherOpen] = React.useState(false);

  // Split items into Primary Rail (top 6) and Secondary Launcher items
  const primaryRailIds = ["dashboard", "orders", "inventory", "customers", "reports", "settings"];

  const primaryItems = navItems.filter((i) => primaryRailIds.includes(i.id));
  const secondaryItems = navItems.filter((i) => !primaryRailIds.includes(i.id));

  return (
    <aside
      aria-label={lang === "ar" ? "شريط التطبيقات" : "Boutq OS App Dock"}
      className={cn(
        "no-print hidden md:flex flex-col items-center justify-between shrink-0 border border-[var(--os-border)] os-glass-strong shadow-[var(--os-dock-shadow)] transition-all duration-300 relative z-30 my-3 ms-3 py-3 w-16 rounded-[var(--os-radius-dock)] overflow-visible select-none",
        className,
      )}
    >
      {/* Top: Brand Identity / App Rail */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Brand App Monogram + Sidebar Expand Toggle */}
        <div className="flex flex-col items-center gap-2">
          <div
            title={brandLabel}
            aria-label={brandLabel}
            className="h-9 w-9 rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-amber-700 text-primary-foreground font-bold font-heading text-xs flex items-center justify-center shadow-md border border-primary/20 hover:scale-105 transition-transform cursor-pointer"
            onClick={onExpandSidebar}
          >
            {brandLabel.slice(0, 2).toUpperCase()}
          </div>

          {onExpandSidebar && (
            <button
              type="button"
              onClick={onExpandSidebar}
              title={lang === "ar" ? "توسيع شريط القائمة" : "Expand Full Sidebar"}
              aria-label={lang === "ar" ? "توسيع شريط القائمة" : "Expand Full Sidebar"}
              className="h-7 w-7 rounded-xl bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all hover:scale-110 shadow-2xs border border-border/40"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="w-7 h-px bg-[var(--os-border)] my-0.5" />

        {/* Primary App Rail Icons */}
        <nav
          aria-label={lang === "ar" ? "التطبيقات الرئيسية" : "Primary Applications"}
          className="flex flex-col items-center gap-2.5 w-full px-2"
        >
          {primaryItems.map((item) => {
            const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
            const active = pathname.startsWith(targetPath);
            const label = lang === "ar" ? item.labelAr : item.labelEn;
            const Icon = item.icon;

            return (
              <Link
                key={item.id}
                to={item.to as any}
                params={item.params as any}
                title={label}
                aria-label={label}
                className="relative group block outline-none os-focus-ring"
              >
                <div
                  className={cn(
                    "h-10 w-10 rounded-2xl flex items-center justify-center border transition-all duration-200 hover:scale-110 active:scale-95 shadow-2xs",
                    active
                      ? "bg-primary/15 text-primary border-primary/30 ring-2 ring-primary/20"
                      : "bg-background/60 hover:bg-background/90 text-muted-foreground hover:text-foreground border-border/50",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4.5 w-4.5 transition-colors",
                      active ? "stroke-[2.2] text-primary" : "text-foreground/80",
                    )}
                  />
                </div>

                {/* Active App Side Pill */}
                {active && (
                  <span className="absolute top-1/2 -translate-y-1/2 start-0 -ms-1 h-3.5 w-1 rounded-r-full bg-primary shadow-xs" />
                )}

                {/* Hover Tooltip Label */}
                <div className="absolute start-full top-1/2 -translate-y-1/2 ms-3 px-2.5 py-1 rounded-lg bg-popover text-popover-foreground text-xs font-semibold shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 border border-border/60">
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom: Storefront Link, State-of-the-Art App Drawer Launcher, & Super Admin */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* Secondary App Drawer Launcher */}
        {secondaryItems.length > 0 && (
          <Sheet open={launcherOpen} onOpenChange={setLauncherOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                title={lang === "ar" ? "مكتبة التطبيقات" : "App Library"}
                aria-label={lang === "ar" ? "مكتبة التطبيقات" : "App Library"}
                className={cn(
                  "h-9 w-9 rounded-xl bg-muted/60 text-muted-foreground hover:bg-muted/90 hover:text-foreground border border-border/60 flex items-center justify-center transition-all hover:scale-105 outline-none os-focus-ring",
                  launcherOpen && "bg-primary text-primary-foreground border-primary shadow-md",
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
            </SheetTrigger>

            {/* State-of-the-Art iOS/macOS Launchpad Sheet */}
            <SheetContent
              side={lang === "ar" ? "right" : "left"}
              hideDefaultClose
              className="w-[360px] sm:w-[380px] border-s border-[var(--os-border)] p-0 flex flex-col bg-card/95 dark:bg-slate-950/95 backdrop-blur-2xl text-foreground shadow-2xl overflow-hidden z-50"
            >
              {/* Ambient backdrop glow */}
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/15 blur-3xl pointer-events-none animate-pulse" />
              <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

              <SheetTitle className="sr-only">
                {lang === "ar" ? "مكتبة التطبيقات" : "App Library"}
              </SheetTitle>

              {/* Launchpad Header */}
              <div className="p-5 border-b border-[var(--os-border)] bg-card/60 backdrop-blur-md flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-amber-700 text-primary-foreground font-bold font-heading text-sm flex items-center justify-center shadow-xs border border-primary/20 shrink-0">
                    {brandLabel.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold font-heading flex items-center gap-1.5 text-foreground truncate">
                      <span className="truncate">
                        {lang === "ar" ? "مكتبة التطبيقات" : "App Library"}
                      </span>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 shrink-0">
                        OS
                      </span>
                    </h2>
                    <p className="text-xs text-muted-foreground truncate">{brandLabel}</p>
                  </div>
                </div>

                <SheetClose asChild>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-full bg-muted/80 hover:bg-muted text-foreground border border-border/60 flex items-center justify-center transition-transform active:scale-95 shadow-2xs shrink-0"
                    aria-label={lang === "ar" ? "إغلاق" : "Close"}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </SheetClose>
              </div>

              {/* Launchpad App Cards Grid */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto relative z-10 os-scrollbar">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    {lang === "ar" ? "التطبيقات والأدوات المتاحة" : "Available Tools & Modules"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {secondaryItems.map((item) => {
                    const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                    const active = pathname.startsWith(targetPath);
                    const Icon = item.icon;
                    const label = lang === "ar" ? item.labelAr : item.labelEn;
                    const config = APP_CONFIG_MAP[item.id] ?? {
                      gradient: "from-primary via-primary/90 to-amber-700",
                      descAr: "وحدة النظام الفرعية",
                      descEn: "System Module",
                    };

                    return (
                      <Link
                        key={item.id}
                        to={item.to as any}
                        params={item.params as any}
                        onClick={() => setLauncherOpen(false)}
                        className={cn(
                          "group relative flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 active:scale-[0.98]",
                          active
                            ? "bg-primary/10 border-primary/40 shadow-sm ring-1 ring-primary/20"
                            : "bg-background/80 hover:bg-card border-border/60 hover:border-primary/30 shadow-2xs hover:shadow-md",
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Vibrant iOS-style Gradient Icon Box */}
                          <div
                            className={cn(
                              "h-11 w-11 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shrink-0 shadow-sm border border-white/20 transition-transform group-hover:scale-105",
                              config.gradient,
                            )}
                          >
                            <Icon className="h-5.5 w-5.5" />
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold font-heading text-foreground truncate flex items-center gap-1.5">
                              <span>{label}</span>
                              {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                              {lang === "ar" ? config.descAr : config.descEn}
                            </p>
                          </div>
                        </div>

                        <div className="h-7 w-7 rounded-xl bg-muted/40 group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground flex items-center justify-center transition-colors shrink-0 ms-2">
                          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* View Storefront Link */}
        {activeSlug && !isCourier && (
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
            title={lang === "ar" ? "عرض المتجر" : "View Storefront"}
            aria-label={lang === "ar" ? "عرض المتجر" : "View Storefront"}
            className="h-9 w-9 rounded-xl bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-border/60 flex items-center justify-center transition-all hover:scale-105"
          >
            <Store className="h-4 w-4 text-primary" />
          </a>
        )}

        {/* Super Admin Switcher */}
        {isSuperAdmin && (
          <OsBrandSwitcher
            activeSlug={activeSlug}
            brands={brands}
            lang={lang}
            pathname={pathname}
            collapsed={true}
          />
        )}
      </div>
    </aside>
  );
}
