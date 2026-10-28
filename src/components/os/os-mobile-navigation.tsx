import * as React from "react";
import { useNewArrivals } from "@/lib/new-arrivals";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  LogOut,
  Grid,
  X,
  Store,
  Clock as ClockIcon,
  Settings,
  Activity,
  Boxes,
  Fingerprint,
  Sun,
  Moon,
  Monitor,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { type OsMobileTabItem } from "./os-mobile-tab-bar";
import { OsIslandDock, type OsIslandDockItem } from "./os-island-dock";
import { useBottomBarClaimed } from "@/lib/bottom-bar-store";
import { OsQuickActions } from "./os-quick-actions";
import { OsAppsHubModal } from "./os-apps-hub-modal";
import {
  adminNavGroups,
  dockWorkspaces,
  isNavItemActive,
  type AdminNavItemConfig,
} from "@/config/admin-navigation";
import { OsNavMore } from "./os-nav-more";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

export interface OsMobileNavigationProps {
  brandLabel: string;
  currentPageLabel?: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  isSuperAdmin?: boolean;
  /** A courier sees their deliveries only: no office dock, no New button. */
  isCourier?: boolean;
  onSetLang: (lang: "en" | "ar") => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onOpenChangeMobile: (open: boolean) => void;
  /** A services store (see isServicesProfile). */
  services?: boolean;
}

export function OsMobileNavigation({
  brandLabel,
  currentPageLabel,
  activeSlug,
  navItems,
  pathname,
  lang,
  isSuperAdmin = false,
  isCourier = false,
  onSetLang,
  onSignOut,
  mobileOpen,
  onOpenChangeMobile,
  services = false,
}: OsMobileNavigationProps) {
  const navigate = useNavigate();
  const bottomBarClaimed = useBottomBarClaimed();
  const { theme, setTheme } = useTheme();
  const [appsHubOpen, setAppsHubOpen] = React.useState(false);

  // Mobile dock remains visible across views for constant accessible navigation
  const isDetailPage = false;

  // Pick top items for quick mobile tabs + "More" item
  const arrivals = useNewArrivals();
  const primaryTabItems: OsIslandDockItem[] = React.useMemo(() => {
    if (!activeSlug) {
      if (isSuperAdmin) {
        return [
          {
            id: "brands",
            icon: Store,
            label: lang === "ar" ? "المتاجر" : "Brands",
            active: pathname === "/admin/brands",
            onClick: () => navigate({ to: "/admin/brands" }),
          },
          {
            id: "requests",
            icon: ClockIcon,
            label: lang === "ar" ? "الطلبات" : "Requests",
            active: pathname === "/admin/super/requests",
            onClick: () => navigate({ to: "/admin/super/requests" }),
          },
          {
            id: "settings",
            icon: Settings,
            label: lang === "ar" ? "الإعدادات" : "Settings",
            active: pathname === "/admin/super/settings",
            onClick: () => navigate({ to: "/admin/super/settings" }),
          },
          {
            id: "more",
            icon: Grid,
            label: lang === "ar" ? "المزيد" : "More",
            active: mobileOpen,
            onClick: () => onOpenChangeMobile(!mobileOpen),
          },
        ];
      }
      return [];
    }

    // The daily workspaces the person has a page in, from the menu's one definition: each opens
    // its first page and is lit while any of its pages is open (no list of addresses to keep).
    const items: OsMobileTabItem[] = dockWorkspaces(navItems, pathname).map(
      ({ workspace, first, active }) => ({
        id: workspace.id,
        icon: workspace.icon,
        label: lang === "ar" ? workspace.shortLabelAr : workspace.shortLabelEn,
        active,
        badge: workspace.id === "orders" && arrivals > 0 ? arrivals : undefined,
        onClick: () => navigate({ to: first.to as any, params: first.params as any }),
      }),
    );
    items.push({
      id: "more",
      icon: Grid,
      label: lang === "ar" ? "المزيد" : "More",
      active: mobileOpen,
      onClick: () => onOpenChangeMobile(!mobileOpen),
    });

    return items;
  }, [
    activeSlug,
    isSuperAdmin,
    navItems,
    pathname,
    lang,
    navigate,
    mobileOpen,
    onOpenChangeMobile,
    arrivals,
  ]);

  // Organize navigation items into iOS Control Center Groups
  const navGroups = React.useMemo(() => {
    if (!activeSlug && isSuperAdmin) {
      const superItems: AdminNavItemConfig[] = [
        {
          id: "brands",
          to: "/admin/brands",
          labelEn: "Manage Brands & Tenants",
          labelAr: "إدارة العلامات والمتاجر",
          icon: Store,
          workspace: "home",
        },
        {
          id: "requests",
          to: "/admin/super/requests",
          labelEn: "Tenant Requests",
          labelAr: "طلبات الانضمام والاشتراكات",
          icon: ClockIcon,
          workspace: "home",
        },
        {
          id: "grants",
          to: "/admin/super/grants",
          labelEn: "Grant Surveys",
          labelAr: "مبادرة الـ 6 شهور",
          icon: Crown,
          workspace: "home",
        },
        {
          id: "health",
          to: "/admin/super/health",
          labelEn: "System Health",
          labelAr: "صحة النظام",
          icon: Activity,
          workspace: "home",
        },
        {
          id: "settings",
          to: "/admin/super/settings",
          labelEn: "Platform Settings",
          labelAr: "إعدادات المنصة",
          icon: Settings,
          workspace: "home",
        },
      ];
      return [
        {
          id: "super_admin",
          title: lang === "ar" ? "إدارة المنصة" : "Platform Management",
          items: superItems,
          more: [] as AdminNavItemConfig[],
        },
      ];
    }

    return adminNavGroups(navItems).map((group) => ({
      id: group.id,
      title: lang === "ar" ? group.labelAr : group.labelEn,
      items: group.items,
      more: group.more,
    }));
  }, [activeSlug, isSuperAdmin, navItems, lang]);

  // One page in the menu sheet.
  const sheetLink = (item: AdminNavItemConfig) => {
    const active = isNavItemActive(item, pathname);
    const Icon = item.icon;
    const label = lang === "ar" ? item.labelAr : item.labelEn;
    return (
      <Link
        key={item.id}
        to={item.to as any}
        params={item.params as any}
        onClick={() => onOpenChangeMobile(false)}
        className={cn(
          "flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-medium transition duration-200 active:scale-[0.98]",
          active
            ? "bg-primary text-primary-foreground font-semibold shadow-md border border-primary/30"
            : "text-foreground/90 hover:text-foreground hover:bg-card/40",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition",
              active
                ? "bg-white/20 text-primary-foreground shadow-2xs"
                : "bg-primary/10 text-primary border border-primary/20",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="truncate">{label}</span>
        </div>
        {active && <span className="h-2 w-2 rounded-full bg-primary-foreground shadow-2xs" />}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Top Header */}
      {/* Under the notch when the admin runs full screen (`viewport-fit=cover`), its content below
          it; app-shell pads the page by the same amount. Zero in a browser tab and in the app. */}
      <div className="md:hidden no-print fixed top-0 inset-x-0 z-40 h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] flex items-center justify-between px-3 border-b border-[var(--os-border)] os-glass-strong text-foreground shadow-sm">
        <Sheet open={mobileOpen} onOpenChange={onOpenChangeMobile}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-foreground hover:bg-muted/80"
              aria-label={lang === "ar" ? "القائمة الرئيسية" : "Menu"}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>

          {/* iOS Liquid Glass Control Center Sheet */}
          <SheetContent
            side={lang === "ar" ? "right" : "left"}
            hideDefaultClose
            className="w-[85vw] sm:w-80 max-w-xs border-s border-border-strong p-0 flex flex-col bg-card text-foreground shadow-2xl overflow-hidden z-50 admin-mobile-fast-transition"
          >
            {/* Ambient liquid background blur blobs */}
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-10 -left-16 w-48 h-48 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

            <SheetTitle className="sr-only">{brandLabel}</SheetTitle>

            {/* iOS Style Sheet Header */}
            <div className="p-4 sm:p-5 border-b border-border-subtle bg-card/40 backdrop-blur-md flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-amber-500/20 border border-border-subtle text-primary font-heading font-black text-lg flex items-center justify-center shadow-xs shrink-0">
                  {brandLabel.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold font-heading text-foreground truncate flex items-center gap-1.5">
                    <span className="truncate">{brandLabel}</span>
                    <span className="text-xs font-mono uppercase px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 shrink-0">
                      OS
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">{currentPageLabel || ""}</p>
                </div>
              </div>

              {/* iOS Style Round Glass Close Button */}
              <SheetClose asChild>
                <button
                  type="button"
                  className="h-9 w-9 rounded-full bg-muted/80 hover:bg-muted text-foreground border border-border-subtle flex items-center justify-center transition-transform active:scale-90 shadow-sm shrink-0"
                  aria-label={lang === "ar" ? "إغلاق" : "Close"}
                >
                  <X className="h-4 w-4" />
                </button>
              </SheetClose>
            </div>

            {/* Categorized iOS Control Center Navigation Menu */}
            <nav className="flex-1 p-3.5 space-y-4 overflow-y-auto relative z-10 os-scrollbar">
              {/* Apps & Tools Hub Launcher Button */}
              {activeSlug && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenChangeMobile(false);
                    setAppsHubOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-amber-500/10 border border-primary/25 text-primary shadow-xs transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                      <Boxes className="h-4 w-4" />
                    </div>
                    <div className="text-start">
                      <div className="text-xs font-bold font-heading">
                        {lang === "ar" ? "كل الأدوات" : "All tools"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {lang === "ar"
                          ? "كل صفحات المتجر، مع ما تفيد به كل منها"
                          : "Every page of the store, with what each is for"}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-primary/20 text-primary">
                    {lang === "ar" ? "فتح" : "Open"}
                  </span>
                </button>
              )}

              {navGroups.map((group) => {
                if (group.items.length + group.more.length === 0) return null;
                return (
                  <div key={group.id} className="space-y-1.5">
                    <div className="text-xs font-semibold text-muted-foreground px-2 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      <span>{group.title}</span>
                    </div>

                    <div className="space-y-1 bg-card/30 backdrop-blur-md rounded-2xl p-1.5 border border-border shadow-2xs">
                      {group.items.map(sheetLink)}
                      {group.more.length > 0 && (
                        <OsNavMore
                          count={group.more.length}
                          containsActive={group.more.some((item) =>
                            isNavItemActive(item, pathname),
                          )}
                          lang={lang}
                        >
                          {group.more.map(sheetLink)}
                        </OsNavMore>
                      )}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* iOS Liquid Control Center Footer */}
            <div className="p-3 border-t border-border-subtle bg-card/40 backdrop-blur-md space-y-2 relative z-10">
              {/* Native App Tools Trigger (When in iPhone/Android Native App Wrapper) */}
              {typeof window !== "undefined" && Boolean((window as any).ReactNativeWebView) && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 min-h-[44px] gap-2 text-xs font-semibold text-primary hover:bg-primary/10 border-primary/30 bg-primary/5 rounded-2xl transition"
                  onClick={() => {
                    (window as any).ReactNativeWebView?.postMessage(
                      JSON.stringify({ type: "OPEN_NATIVE_TOOLS" }),
                    );
                    onOpenChangeMobile(false);
                  }}
                >
                  <Fingerprint className="h-4 w-4 shrink-0" />
                  <span>
                    {lang === "ar"
                      ? "أدوات تطبيق الآيفون (البصمة والإشعارات)"
                      : "iPhone App Tools (Face ID & Push)"}
                  </span>
                </Button>
              )}

              {/* Ultra-Compact Quick Preferences: Theme (Light / Dark / Auto) & Language (AR / EN) */}
              <div className="flex items-center justify-between gap-2 p-1 rounded-2xl bg-muted/60 border border-border">
                {/* Theme Segmented Icons */}
                <div className="flex items-center rounded-xl bg-background/80 p-0.5 border border-border shadow-2xs">
                  <Button
                    type="button"
                    size="sm"
                    variant={theme === "light" ? "default" : "ghost"}
                    onClick={() => setTheme("light")}
                    className={cn(
                      "h-8 w-8 p-0 rounded-lg transition",
                      theme !== "light" && "text-muted-foreground hover:text-foreground",
                    )}
                    title={lang === "ar" ? "فاتح" : "Light"}
                    aria-label={lang === "ar" ? "فاتح" : "Light"}
                  >
                    <Sun className="h-4 w-4 shrink-0" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={theme === "dark" ? "default" : "ghost"}
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "h-8 w-8 p-0 rounded-lg transition",
                      theme !== "dark" && "text-muted-foreground hover:text-foreground",
                    )}
                    title={lang === "ar" ? "داكن" : "Dark"}
                    aria-label={lang === "ar" ? "داكن" : "Dark"}
                  >
                    <Moon className="h-4 w-4 shrink-0" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={theme === "system" ? "default" : "ghost"}
                    onClick={() => setTheme("system")}
                    className={cn(
                      "h-8 w-8 p-0 rounded-lg transition",
                      theme !== "system" && "text-muted-foreground hover:text-foreground",
                    )}
                    title={lang === "ar" ? "تلقائي" : "Auto"}
                    aria-label={lang === "ar" ? "تلقائي" : "Auto"}
                  >
                    <Monitor className="h-4 w-4 shrink-0" />
                  </Button>
                </div>

                {/* Language Segmented Toggle */}
                <div className="flex items-center rounded-xl bg-background/80 p-0.5 border border-border-subtle shadow-2xs">
                  <Button
                    type="button"
                    size="sm"
                    variant={lang === "ar" ? "default" : "ghost"}
                    onClick={() => onSetLang("ar")}
                    className={cn(
                      "h-8 px-2.5 text-xs font-bold rounded-lg transition justify-center",
                      lang !== "ar" && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    العربية
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={lang === "en" ? "default" : "ghost"}
                    onClick={() => onSetLang("en")}
                    className={cn(
                      "h-8 px-2.5 text-xs font-bold rounded-lg transition justify-center",
                      lang !== "en" && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    EN
                  </Button>
                </div>
              </div>

              {/* Sign Out Action */}
              <Button
                variant="outline"
                className="w-full h-11 min-h-[44px] gap-2 text-xs font-semibold text-destructive hover:bg-destructive/15 border-destructive/30 bg-destructive/5 rounded-2xl transition"
                onClick={onSignOut}
              >
                <LogOut className="h-4 w-4" />
                <span>{lang === "ar" ? "تسجيل الخروج" : "Sign Out"}</span>
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 text-center leading-tight flex-1 px-2">
          <div className="truncate text-base font-bold font-heading text-foreground">
            {brandLabel}
          </div>
          {currentPageLabel && (
            <div className="truncate text-xs text-muted-foreground font-medium">
              {currentPageLabel}
            </div>
          )}
        </div>

        {/* Theme, language and signing out live in the menu (the drawer): the bar keeps its room for the store's name. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <OsQuickActions
            slug={activeSlug}
            lang={lang}
            services={services}
            isCourier={isCourier}
            className="h-8.5 px-2 text-xs"
          />
        </div>
      </div>

      {/* Mobile & Tablet Floating Island Dock */}
      {/* A courier has one screen, their deliveries: no dock of office workspaces. */}
      {(activeSlug || isSuperAdmin) && !isCourier && (
        <OsIslandDock
          items={primaryTabItems}
          lang={lang}
          isHidden={isDetailPage || bottomBarClaimed}
        />
      )}

      {/* Apps Hub Modal */}
      {activeSlug && (
        <OsAppsHubModal
          open={appsHubOpen}
          onOpenChange={setAppsHubOpen}
          activeSlug={activeSlug}
          navItems={navItems}
          lang={lang}
        />
      )}
    </>
  );
}
