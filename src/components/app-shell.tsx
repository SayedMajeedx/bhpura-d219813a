import { Link, useRouterState, useNavigate, useParams } from "@tanstack/react-router";
import { LayoutDashboard, Package, Users, ReceiptText, Settings, LogOut, Languages, Menu, Wallet, Megaphone, Shield, Store, Crown, Plug, Tags, FileText, BadgePercent, Mail, Clock as ClockIcon } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useProfile } from "@/lib/profile-context";

type BrandRow = { id: string; slug: string; name_en: string; is_active: boolean };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, isAdmin, isSuperAdmin, isCourier, isLoading, profileError, signOutAndRedirect } = useProfile();

  // Extract slug from current URL when inside /b/:slug/*
  const routeParams = useParams({ strict: false }) as { slug?: string };
  const urlSlug = routeParams?.slug ?? null;

  // Fallback: use the user's own brand slug when we're outside /b/:slug (e.g. on /brands)
  const activeSlug = urlSlug ?? profile?.brand?.slug ?? null;

  // close drawer when route changes
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body viewport scrolling for premium native app panel feel
  useEffect(() => {
    const origHtmlOverflow = document.documentElement.style.overflow;
    const origHtmlHeight = document.documentElement.style.height;
    const origBodyOverflow = document.body.style.overflow;
    const origBodyHeight = document.body.style.height;

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";

    return () => {
      document.documentElement.style.overflow = origHtmlOverflow;
      document.documentElement.style.height = origHtmlHeight;
      document.body.style.overflow = origBodyOverflow;
      document.body.style.height = origBodyHeight;
    };
  }, []);

  // Force-logout only if profile exists and is explicitly inactive
  useEffect(() => {
    if (isLoading) return;
    if (profile && profile.status === "inactive") {
      (async () => { await signOutAndRedirect(); })();
    }
  }, [isLoading, profile, signOutAndRedirect]);

  // Super admin: load all brands for the switcher
  const brandsQ = useQuery({
    queryKey: ["brands-switcher"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, slug, name_en, is_active")
        .order("name_en");
      if (error) throw error;
      return (data ?? []) as BrandRow[];
    },
    enabled: isSuperAdmin,
  });

  // Build brand-prefixed nav items. If no active slug, links go to /dashboard (redirector).
  const nav = useMemo(() => {
    const items: { to: string; params?: any; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean; section: string }[] = [];
    if (activeSlug) {
      if (isCourier) {
        items.push({ to: "/admin/b/$slug/orders", params: { slug: activeSlug }, label: t("nav.orders"), icon: ReceiptText, section: lang === "ar" ? "التوصيل" : "Delivery" });
        return items;
      }
      items.push(
        { to: "/admin/b/$slug/dashboard", params: { slug: activeSlug }, label: t("nav.dashboard"), icon: LayoutDashboard, section: lang === "ar" ? "نظرة عامة" : "Overview" },
        { to: "/admin/b/$slug/orders", params: { slug: activeSlug }, label: t("nav.orders"), icon: ReceiptText, section: lang === "ar" ? "المبيعات" : "Sales" },
        { to: "/admin/b/$slug/customers", params: { slug: activeSlug }, label: t("nav.customers"), icon: Users, section: lang === "ar" ? "المبيعات" : "Sales" },
        { to: "/admin/b/$slug/campaigns", params: { slug: activeSlug }, label: lang === "ar" ? "حملات الواتساب" : "WhatsApp Campaigns", icon: Megaphone, section: lang === "ar" ? "المبيعات" : "Sales" },
        { to: "/admin/b/$slug/discounts", params: { slug: activeSlug }, label: lang === "ar" ? "رموز الخصم" : "Discount Codes", icon: BadgePercent, adminOnly: true, section: lang === "ar" ? "التسويق" : "Marketing" },
      );
      items.push({ to: "/admin/b/$slug/inventory", params: { slug: activeSlug }, label: t("nav.inventory"), icon: Package, section: lang === "ar" ? "الكتالوج" : "Catalog" });
      items.push({ to: "/admin/b/$slug/categories", params: { slug: activeSlug }, label: lang === "ar" ? "الأقسام" : "Categories", icon: Tags, section: lang === "ar" ? "الكتالوج" : "Catalog" });
      items.push({ to: "/admin/b/$slug/expenses", params: { slug: activeSlug }, label: t("nav.expenses"), icon: Wallet, adminOnly: true, section: lang === "ar" ? "المالية" : "Finance" });
      if (isAdmin) {
        items.push({ to: "/admin/b/$slug/team", params: { slug: activeSlug }, label: lang === "ar" ? "إدارة الموظفين" : "Team Management", icon: Shield, section: lang === "ar" ? "الوصول" : "Access" });
        items.push({ to: "/admin/b/$slug/integrations", params: { slug: activeSlug }, label: t("nav.integrations"), icon: Plug, section: lang === "ar" ? "واجهة المتجر" : "Storefront" });
      }
      items.push({ to: "/admin/b/$slug/communications", params: { slug: activeSlug }, label: lang === "ar" ? "الاتصالات" : "Communications", icon: Mail, section: lang === "ar" ? "واجهة المتجر" : "Storefront" });
      items.push({ to: "/admin/b/$slug/pages", params: { slug: activeSlug }, label: lang === "ar" ? "الصفحات والسياسات" : "Pages & Policies", icon: FileText, section: lang === "ar" ? "واجهة المتجر" : "Storefront" });
      items.push({ to: "/admin/b/$slug/settings", params: { slug: activeSlug }, label: t("nav.settings"), icon: Settings, section: lang === "ar" ? "واجهة المتجر" : "Storefront" });

    }
    return items.filter((item) => !item.adminOnly || isAdmin);
  }, [t, lang, isAdmin, isCourier, activeSlug]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const brandLabel = profile?.brand?.[lang === "ar" ? "name_ar" : "name_en"] ?? profile?.brand?.name_en ?? t("app.title");
  const currentPageLabel = nav.find((item) => pathname.startsWith(item.to.replace("$slug", item.params?.slug ?? "")))?.label;

  const SidebarContent = (
    <>
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-2xl font-display text-sidebar-foreground leading-tight">{brandLabel}</h1>
        <p className="mt-1 text-xs text-sidebar-foreground/70">{t("app.subtitle")}</p>
      </div>

      {isSuperAdmin && (
        <div className="p-3 border-b border-sidebar-border space-y-2">
          <div className="flex items-center gap-2 px-1 text-xs uppercase tracking-wider text-sidebar-foreground/80">
            <Crown className="h-3.5 w-3.5" />
            {lang === "ar" ? "المدير الأعلى" : "Super Admin"}
          </div>
          <Select
            value={activeSlug ?? ""}
            onValueChange={(v) => navigate({ to: "/admin/b/$slug/dashboard", params: { slug: v } })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={lang === "ar" ? "اختر علامة" : "Select a brand"} />
            </SelectTrigger>
            <SelectContent>
              {(brandsQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.name_en}{!b.is_active ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link
            to="/admin/brands"
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
              pathname === "/admin/brands"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Store className="h-3.5 w-3.5" />
            {lang === "ar" ? "إدارة العلامات" : "Manage brands"}
          </Link>
          <Link
            to="/admin/super/requests"
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
              pathname === "/admin/super/requests"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <ClockIcon className="h-3.5 w-3.5" />
            {lang === "ar" ? "طلبات التسجيل" : "Tenant Requests"}
          </Link>
          <Link
            to="/admin/super/settings"
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
              pathname === "/admin/super/settings"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            {lang === "ar" ? "إعدادات المنصة" : "Platform Settings"}
          </Link>
        </div>
      )}

      {activeSlug && !isCourier && (
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
            className="flex items-center justify-center gap-2 rounded-md bg-sidebar-primary px-3 py-2 text-sm font-medium text-sidebar-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
          >
            <Store className="h-4 w-4" />
            {lang === "ar" ? "عرض المتجر" : "View Storefront"}
          </a>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-none">
        {nav.map((item, index) => {
          const active = pathname.startsWith(item.to.replace("$slug", item.params?.slug ?? ""));
          const Icon = item.icon;
          const showSection = index === 0 || nav[index - 1]?.section !== item.section;
          return (
            <div key={item.to}>
              {showSection && (
                <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/65">
                  {item.section}
                </div>
              )}
              <Link
              to={item.to as any}
              params={item.params}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>
    </>
  );

  // SECURITY: fail closed. If we're done loading and still have no profile,
  // the account has no confirmed role/brand — don't render the admin shell
  // or any of its data-fetching children.
  if (!isLoading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-xl font-display text-primary">
            {lang === "ar" ? "الحساب بانتظار الإعداد" : "Account pending setup"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "لم يتم العثور على صلاحيات لحسابك بعد. يرجى التواصل مع المسؤول العام لإعداد حسابك."
              : "We couldn't confirm your access role yet. Please contact the super admin to finish setting up your account."}
          </p>
          {profileError && (
            <p className="text-xs text-muted-foreground/70">
              {lang === "ar" ? "حدث خطأ أثناء التحقق." : "There was an error verifying your account."}
            </p>
          )}
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> {t("nav.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  const isImpersonating = isSuperAdmin && urlSlug !== null;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {isImpersonating && (
        <div className="no-print bg-gradient-to-r from-amber-600 to-amber-500 text-white px-4 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2 border-b border-amber-700/40 shrink-0 select-none shadow-md z-50">
          <Shield className="h-4 w-4 text-white animate-pulse" />
          <span>
            {lang === "ar"
              ? "⚠️ أنت تقوم حالياً باستعراض هذا المتجر عبر وضع محاكاة المسؤول الخارق (Superadmin). يتم تسجيل جميع الإجراءات الإدارية في سجل التدقيق الخاص بنا."
              : "⚠️ You are currently viewing this store via Superadmin Impersonation mode. All administrative actions are being recorded to our immutable audit log."}
          </span>
        </div>
      )}
      <div className="flex-1 flex bg-background overflow-hidden">
        <aside className="no-print hidden md:flex w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex-col shrink-0">
        {SidebarContent}
      </aside>

      <div className="md:hidden no-print fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-3 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side={lang === "ar" ? "right" : "left"}
            className="w-72 border-0 p-0 flex flex-col bg-sidebar text-sidebar-foreground shadow-2xl"
          >
            <SheetTitle className="sr-only">{brandLabel}</SheetTitle>
            {SidebarContent}
          </SheetContent>
        </Sheet>
        <div className="min-w-0 text-center leading-tight flex-1 px-2">
          <h1 className="truncate text-base font-display text-sidebar-foreground">{brandLabel}</h1>
          {currentPageLabel && <div className="truncate text-[10px] text-sidebar-foreground/70">{currentPageLabel}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground/80 hover:text-sidebar-foreground"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            aria-label="Toggle language"
          >
            <span className="text-[10px] font-bold uppercase">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground/80 hover:text-sidebar-foreground"
            onClick={signOut}
            aria-label={t("nav.signOut")}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <main className="flex-1 flex flex-col print-area pt-14 md:pt-0 bg-background/95 overflow-hidden">
        <header className="no-print hidden md:flex h-14 border-b border-border bg-card shrink-0 items-center justify-between px-8">
          <div className="font-display font-medium text-lg text-foreground">
            {currentPageLabel || ""}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs text-muted-foreground hover:text-foreground" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" /> {t("nav.signOut")}
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto min-h-0">
          {children}
        </div>
      </main>
      </div>
    </div>
  );
}
