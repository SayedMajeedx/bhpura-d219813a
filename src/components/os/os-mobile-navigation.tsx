import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, LogOut, LayoutDashboard, ReceiptText, Package, Users, Grid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { OsMobileTabBar, type OsMobileTabItem } from "./os-mobile-tab-bar";
import { type AdminNavItemConfig } from "@/config/admin-navigation";
import { cn } from "@/lib/utils";

export interface OsMobileNavigationProps {
  brandLabel: string;
  currentPageLabel?: string;
  activeSlug: string | null;
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  onSetLang: (lang: "en" | "ar") => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onOpenChangeMobile: (open: boolean) => void;
}

export function OsMobileNavigation({
  brandLabel,
  currentPageLabel,
  activeSlug,
  navItems,
  pathname,
  lang,
  onSetLang,
  onSignOut,
  mobileOpen,
  onOpenChangeMobile,
}: OsMobileNavigationProps) {
  const navigate = useNavigate();

  // Pick top 4 items for quick mobile tabs + "More" item
  const primaryTabItems: OsMobileTabItem[] = React.useMemo(() => {
    if (!activeSlug) return [];

    const homeItem = navItems.find((i) => i.id === "dashboard") ?? {
      id: "dashboard",
      icon: LayoutDashboard,
      label: lang === "ar" ? "الرئيسية" : "Home",
      target: `/admin/b/${activeSlug}/dashboard`,
    };

    const ordersItem = navItems.find((i) => i.id === "orders") ?? {
      id: "orders",
      icon: ReceiptText,
      label: lang === "ar" ? "الطلبات" : "Orders",
      target: `/admin/b/${activeSlug}/orders`,
    };

    const inventoryItem = navItems.find((i) => i.id === "inventory") ?? {
      id: "inventory",
      icon: Package,
      label: lang === "ar" ? "المخزون" : "Inventory",
      target: `/admin/b/${activeSlug}/inventory`,
    };

    const customersItem = navItems.find((i) => i.id === "customers") ?? {
      id: "customers",
      icon: Users,
      label: lang === "ar" ? "العملاء" : "Customers",
      target: `/admin/b/${activeSlug}/customers`,
    };

    const items: OsMobileTabItem[] = [
      {
        id: "home",
        icon: homeItem.icon ?? LayoutDashboard,
        label: lang === "ar" ? "الرئيسية" : "Home",
        active: pathname.includes("/dashboard"),
        onClick: () => navigate({ to: `/admin/b/$slug/dashboard`, params: { slug: activeSlug } }),
      },
      {
        id: "orders",
        icon: ordersItem.icon ?? ReceiptText,
        label: lang === "ar" ? "الطلبات" : "Orders",
        active: pathname.includes("/orders"),
        onClick: () => navigate({ to: `/admin/b/$slug/orders`, params: { slug: activeSlug } }),
      },
      {
        id: "inventory",
        icon: inventoryItem.icon ?? Package,
        label: lang === "ar" ? "المخزون" : "Inventory",
        active: pathname.includes("/inventory"),
        onClick: () => navigate({ to: `/admin/b/$slug/inventory`, params: { slug: activeSlug } }),
      },
      {
        id: "customers",
        icon: customersItem.icon ?? Users,
        label: lang === "ar" ? "العملاء" : "Customers",
        active: pathname.includes("/customers"),
        onClick: () => navigate({ to: `/admin/b/$slug/customers`, params: { slug: activeSlug } }),
      },
      {
        id: "more",
        icon: Grid,
        label: lang === "ar" ? "المزيد" : "More",
        active: mobileOpen,
        onClick: () => onOpenChangeMobile(!mobileOpen),
      },
    ];

    return items;
  }, [activeSlug, navItems, pathname, lang, navigate, mobileOpen, onOpenChangeMobile]);

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden no-print fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-3 border-b border-[var(--os-border)] os-glass-strong text-foreground shadow-sm backdrop-blur-xl">
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
          <SheetContent
            side={lang === "ar" ? "right" : "left"}
            className="w-80 border-e border-[var(--os-border)] p-0 flex flex-col os-glass-strong text-foreground shadow-2xl"
          >
            <SheetTitle className="sr-only">{brandLabel}</SheetTitle>
            <div className="p-5 border-b border-[var(--os-border)] bg-card/40 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold font-heading">{brandLabel}</h2>
                <p className="text-xs text-muted-foreground">{currentPageLabel || ""}</p>
              </div>
            </div>
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {navItems.map((item) => {
                const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
                const active = pathname.startsWith(targetPath);
                const Icon = item.icon;
                const label = lang === "ar" ? item.labelAr : item.labelEn;

                return (
                  <Link
                    key={item.id}
                    to={item.to as any}
                    params={item.params as any}
                    onClick={() => onOpenChangeMobile(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-sm font-medium transition-all",
                      active
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 text-center leading-tight flex-1 px-2">
          <h1 className="truncate text-base font-bold font-heading text-foreground">
            {brandLabel}
          </h1>
          {currentPageLabel && (
            <div className="truncate text-[10px] text-muted-foreground font-medium">
              {currentPageLabel}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl"
            onClick={() => onSetLang(lang === "en" ? "ar" : "en")}
            aria-label={lang === "en" ? "تبديل إلى العربية" : "Switch to English"}
          >
            <span className="text-[11px] font-bold uppercase">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive rounded-xl"
            onClick={onSignOut}
            aria-label={lang === "ar" ? "تسجيل الخروج" : "Sign Out"}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {activeSlug && <OsMobileTabBar items={primaryTabItems} />}
    </>
  );
}
