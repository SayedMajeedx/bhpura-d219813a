import { useRouterState, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { LogOut, Shield, Store } from "lucide-react";
import { SpotlightCommandPalette } from "@/components/spotlight-command-palette";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { businessSettingsQueries, type BusinessSettingsRow } from "@/lib/data/business-settings";
import { customersQueries } from "@/lib/data/customers";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { toast } from "sonner";
import { getAdminNavItems } from "@/config/admin-navigation";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { OsAppDockRail } from "@/components/os/os-app-dock-rail";
import { OsSidebar } from "@/components/os/os-sidebar";
import { OsMenuBar } from "@/components/os/os-menu-bar";
import { OsAppWindow } from "@/components/os/os-app-window";
import { OsWorkspaceTabs } from "@/components/os/os-workspace-tabs";
import { OsMobileNavigation } from "@/components/os/os-mobile-navigation";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/lib/theme-context";
import { getStorefrontUrl } from "@/lib/storefront-url";
import {
  customFontFaces,
  defaultAdminTypography,
  normalizeTypography,
  typographyVariables,
} from "@/lib/typography";
import { ordersKeys, ordersQueries, type OrderDetail } from "@/lib/data/orders";
import { brandQueries } from "@/lib/data/brands";
import { signOut as signOutSession } from "@/lib/auth/session";
import { pickActiveBrand, resolveWorkspace, workspaceLabel } from "@/lib/admin-workspace";
import { buildBreadcrumbs } from "@/lib/admin-breadcrumbs";

/**
 * Theme is provided here rather than at the router root so the `.dark` class
 * is scoped to admin. Storefront appearance is the merchant's own setting.
 */
/** The admin typography of the shared settings row. */
const adminTypographyOf = (row: BusinessSettingsRow | null) => row?.admin_typography ?? null;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AdminWorkspace>{children}</AdminWorkspace>
    </ThemeProvider>
  );
}

function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isRouterNavigating = useRouterState({
    select: (r) => r.status === "pending" || r.isLoading,
  });

  const signalNavigationIntent = (event: {
    target: EventTarget | null;
    currentTarget: EventTarget & HTMLDivElement;
  }) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

    const target = new URL(anchor.href, window.location.origin);
    if (target.origin !== window.location.origin) return;
    if (!target.pathname.startsWith("/admin/")) return;
    if (target.pathname === pathname) return;

    const indicator = event.currentTarget.querySelector<HTMLElement>(
      "[data-navigation-feedback-indicator]",
    );
    if (indicator) {
      const feedbackAt = performance.now();
      indicator.hidden = false;
      indicator.dataset.navigationFeedback = "true";
      indicator.dataset.navigationStartedAt = String(feedbackAt);
      indicator.dataset.navigationTarget = target.pathname;
      document.documentElement.dataset.navigationFeedbackAt = String(feedbackAt);
    }
  };

  const router = useRouter();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("boutq_os_sidebar_expanded") === "true";
    }
    return false;
  });

  const toggleSidebarExpanded = () => {
    setSidebarExpanded((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("boutq_os_sidebar_expanded", String(next));
      }
      return next;
    });
  };

  const {
    profile,
    isAdmin,
    isSuperAdmin,
    isCourier,
    isLoading,
    profileError,
    signOutAndRedirect,
    hasPermission,
  } = useProfile();

  // Extract slug from current URL when inside /b/:slug/*
  const routeParams = useParams({ strict: false }) as { slug?: string };
  const urlSlug = routeParams?.slug ?? null;

  const [spotlightOpen, setSpotlightOpen] = useState(false);

  // Global Command Center keyboard listener (Cmd/Ctrl+K and Esc for focus mode)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSpotlightOpen((open) => !open);
      }
      if (e.key === "Escape" && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isFocusMode]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isFocusMode]);

  const [hasImpersonationToken, setHasImpersonationToken] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return document.cookie.includes("boutq_impersonation_token=");
    }
    return false;
  });

  useEffect(() => {
    if (typeof document !== "undefined") {
      setHasImpersonationToken(document.cookie.includes("boutq_impersonation_token="));
    }
  }, [pathname]);

  const handleExitImpersonation = async () => {
    try {
      const { stopImpersonationSession } = await import("@/lib/impersonation.functions");
      await stopImpersonationSession();
      if (typeof document !== "undefined") {
        document.cookie =
          "boutq_impersonation_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
      toast.success(
        lang === "ar"
          ? "تم الخروج من وضع المحاكاة بنجاح"
          : "Successfully exited impersonation mode.",
      );
      window.location.href = "/admin/brands";
    } catch (err: any) {
      toast.error(err.message || "Failed to exit impersonation mode.");
    }
  };

  // Super admins have a platform workspace outside /admin/b/:slug. Do not let
  // their own profile brand leak tenant navigation into that workspace.
  const { isPlatformMode, activeSlug } = resolveWorkspace({
    urlSlug,
    isSuperAdmin,
    profileBrandSlug: profile?.brand?.slug,
  });

  // Warm the four primary applications once authentication and the active
  // brand are known. This keeps the OS-like app switch fast even before a
  // pointer happens to hover a dock item.
  useEffect(() => {
    if (!activeSlug || isLoading || !profile) return;

    const preloadPrimaryApps = () => {
      const destinations = [
        "/admin/b/$slug/dashboard",
        "/admin/b/$slug/orders",
        "/admin/b/$slug/inventory",
        "/admin/b/$slug/customers",
      ] as const;

      for (const to of destinations) {
        void router.preloadRoute({ to, params: { slug: activeSlug } }).catch(() => undefined);
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preloadPrimaryApps, { timeout: 750 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadPrimaryApps, 100);
    return () => globalThis.clearTimeout(timeoutId);
  }, [activeSlug, isLoading, profile, router]);

  // Close drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body viewport scrolling for clean OS workspace feel
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
      (async () => {
        await signOutAndRedirect();
      })();
    }
  }, [isLoading, profile, signOutAndRedirect]);

  // Super admin: load all brands for switcher
  const brandsQ = useQuery({ ...brandQueries.directory(), enabled: isSuperAdmin });

  const signOut = async () => {
    await signOutSession();
    navigate({ to: "/auth" });
  };

  const activeBrand = pickActiveBrand({
    isPlatformMode,
    activeSlug,
    brands: brandsQ.data,
    profileBrand: profile?.brand,
  });

  const { profile: storeProfile } = useAdminStoreProfile(
    isPlatformMode ? undefined : activeBrand?.id,
  );

  // Build navigation items
  const navItems = useMemo(() => {
    return getAdminNavItems({
      activeSlug,
      isCourier,
      isAdmin,
      hasPermission,
      t,
      lang,
      storefrontMode: storeProfile.storefrontMode,
      storeModules: storeProfile.modules,
    });
  }, [
    activeSlug,
    isCourier,
    isAdmin,
    hasPermission,
    t,
    lang,
    storeProfile.storefrontMode,
    storeProfile.modules,
  ]);
  const adminTypographyQuery = useQuery({
    ...businessSettingsQueries.detail(activeBrand?.id ?? ""),
    select: adminTypographyOf,
    enabled: Boolean(activeBrand?.id) && !isPlatformMode,
    staleTime: 5 * 60_000,
  });
  const adminTypography = normalizeTypography(adminTypographyQuery.data, defaultAdminTypography());
  const adminTypographyLanguage = lang === "ar" ? "ar" : "en";
  const adminTypographyVars = typographyVariables(adminTypography, adminTypographyLanguage);
  const adminFontFaces = customFontFaces(adminTypography, adminTypographyLanguage);
  const brandLabel = workspaceLabel({
    brand: activeBrand,
    activeSlug,
    isPlatformMode,
    lang: lang === "ar" ? "ar" : "en",
    appTitle: t("app.title"),
  });

  const queryClient = useQueryClient();

  const activeNavItem = navItems.find((item) => {
    const targetPath = item.to.replace("$slug", item.params?.slug ?? "");
    return pathname.startsWith(targetPath);
  });

  const currentPageLabel = activeNavItem?.[lang === "ar" ? "labelAr" : "labelEn"];

  const trailingPath = activeNavItem
    ? pathname.slice(activeNavItem.to.replace("$slug", activeNavItem.params?.slug ?? "").length)
    : "";
  const trailingSegment = trailingPath.split("/").filter(Boolean)[0];

  const isOrderRoute = Boolean(
    activeNavItem?.to.includes("/orders") && trailingSegment && trailingSegment !== "new",
  );

  const orderNumberQuery = useQuery({
    ...ordersQueries.invoiceNumber(activeBrand?.id ?? "", trailingSegment ?? ""),
    enabled: isOrderRoute && Boolean(activeBrand?.id),
  });

  const isCustomerRoute = Boolean(
    activeNavItem?.to.includes("/customers") && trailingSegment && trailingSegment !== "new",
  );

  // Shares the profile page's cache entry.
  const customerBreadcrumbQuery = useQuery({
    ...customersQueries.detail(activeBrand?.id ?? "", trailingSegment ?? ""),
    enabled: isCustomerRoute && Boolean(activeBrand?.id),
    staleTime: 5 * 60_000,
  });

  const breadcrumbs = useMemo(() => {
    // The invoice number comes from its query, or from an order already open.
    const cachedOrder =
      isOrderRoute && activeBrand?.id && trailingSegment
        ? (queryClient.getQueryData<OrderDetail>(
            ordersKeys.detail(activeBrand.id, trailingSegment, "office"),
          ) ??
          queryClient.getQueryData<OrderDetail>(
            ordersKeys.detail(activeBrand.id, trailingSegment, "assigned-courier"),
          ))
        : undefined;
    return buildBreadcrumbs({
      pathname,
      activeSlug,
      lang: lang === "ar" ? "ar" : "en",
      section: currentPageLabel
        ? {
            label: currentPageLabel,
            href: activeNavItem
              ? activeNavItem.to.replace("$slug", activeNavItem.params?.slug ?? "")
              : pathname,
          }
        : null,
      trailingSegment,
      isOrderRoute,
      isCustomerRoute,
      invoiceNumber: orderNumberQuery.data?.invoice_number ?? cachedOrder?.invoice_number,
      customerName: customerBreadcrumbQuery.data?.name,
    });
  }, [
    activeBrand?.id,
    activeNavItem,
    activeSlug,
    currentPageLabel,
    customerBreadcrumbQuery.data?.name,
    isCustomerRoute,
    isOrderRoute,
    lang,
    orderNumberQuery.data?.invoice_number,
    pathname,
    queryClient,
    trailingSegment,
  ]);

  // SECURITY: fail closed.
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
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "حدث خطأ أثناء التحقق."
                : "There was an error verifying your account."}
            </p>
          )}
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 me-2" /> {t("nav.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  const isImpersonating = isSuperAdmin && urlSlug !== null && hasImpersonationToken;

  return (
    <div
      className="admin-typography h-screen h-[100dvh] max-h-[100dvh] flex flex-col os-canvas overflow-hidden select-none"
      style={adminTypographyVars as React.CSSProperties}
      onPointerDownCapture={signalNavigationIntent}
      onClickCapture={signalNavigationIntent}
    >
      {/* Top Global Router Transition Progress Bar */}
      <div
        data-navigation-feedback-indicator="true"
        data-navigation-feedback={isRouterNavigating ? "true" : "false"}
        data-navigation-target={pathname}
        hidden={!isRouterNavigating}
        className="fixed top-0 inset-x-0 z-[100] h-0.5 bg-primary/20 overflow-hidden pointer-events-none"
        role="status"
        aria-label={lang === "ar" ? "جارٍ فتح التطبيق" : "Opening application"}
      >
        <div className="h-full bg-primary animate-pulse w-3/4 transition-all duration-300 shadow-sm" />
      </div>

      {adminFontFaces && <style>{adminFontFaces}</style>}
      {/* Impersonation Warning Banner */}
      {isImpersonating && (
        <div className="no-print bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white px-6 py-2 text-center text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-red-700/40 shrink-0 shadow-md z-50 animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-white animate-pulse" />
            <span className="leading-relaxed">
              {lang === "ar"
                ? "⚠️ وضع المحاكاة: استعراض المتجر بصفة مسؤول خارق. جميع الإجراءات مسجلة."
                : "⚠️ IMPERSONATION MODE: Viewing store as Superadmin. All actions are audited."}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleExitImpersonation}
            className="bg-white hover:bg-white/90 text-rose-700 hover:text-rose-800 font-bold px-3 py-1 h-7 rounded text-xs shadow-sm shrink-0 transition-all border-none"
          >
            {lang === "ar" ? "الخروج من وضع المحاكاة" : "Exit Impersonation Mode"}
          </Button>
        </div>
      )}

      {/* Main Boutq OS Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Level 1: Collapsible Navigation (Full Sidebar vs Compact Dock Rail) */}
        {!isFocusMode &&
          (sidebarExpanded || isPlatformMode ? (
            <OsSidebar
              brandLabel={brandLabel}
              brandSubtitle={activeSlug ? `@${activeSlug}` : "Boutq OS"}
              activeSlug={activeSlug}
              navItems={navItems}
              pathname={pathname}
              lang={lang}
              isSuperAdmin={isSuperAdmin}
              isCourier={isCourier}
              brands={brandsQ.data ?? []}
              collapsed={false}
              collapsible={!isPlatformMode}
              onToggleCollapse={toggleSidebarExpanded}
            />
          ) : (
            <OsAppDockRail
              brandLabel={brandLabel}
              activeSlug={activeSlug}
              navItems={navItems}
              pathname={pathname}
              lang={lang}
              isSuperAdmin={isSuperAdmin}
              isCourier={isCourier}
              brands={brandsQ.data ?? []}
              onExpandSidebar={toggleSidebarExpanded}
            />
          ))}

        {/* Mobile Navigation Header & Bottom Dock */}
        <OsMobileNavigation
          brandLabel={brandLabel}
          currentPageLabel={currentPageLabel}
          activeSlug={activeSlug}
          navItems={navItems}
          pathname={pathname}
          lang={lang}
          isSuperAdmin={isSuperAdmin}
          onSetLang={setLang}
          onSignOut={signOut}
          mobileOpen={mobileOpen}
          onOpenChangeMobile={setMobileOpen}
        />

        {/* Level 2: Active Application Window Frame */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0 print-area pt-14 md:pt-0 overflow-hidden transition-[padding] duration-300",
            isFocusMode && "ps-3 pt-3",
          )}
        >
          {/* Level 1: Top System OS Menu Bar */}
          {!isFocusMode && (
            <OsMenuBar
              brandLabel={brandLabel}
              breadcrumbs={breadcrumbs}
              lang={lang}
              onSetLang={setLang}
              onOpenSpotlight={() => setSpotlightOpen(true)}
              onSignOut={signOut}
              activeSlug={activeSlug}
              userEmail={profile?.email}
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
              actions={
                activeSlug && !isCourier ? (
                  <a
                    href={getStorefrontUrl(activeSlug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors"
                    title={lang === "ar" ? "عرض المتجر الإلكتروني" : "View Live Storefront"}
                  >
                    <Store className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline text-xs">
                      {lang === "ar" ? "المتجر" : "Storefront"}
                    </span>
                  </a>
                ) : undefined
              }
            />
          )}

          {/* Level 2: Active Application Window */}
          <main className="relative flex-1 flex flex-col min-h-0 mx-0 md:mx-3 md:mb-3 overflow-hidden select-text">
            <OsAppWindow
              icon={activeNavItem?.icon}
              title={currentPageLabel || brandLabel}
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
              pageKey={pathname}
              workspaceTabs={
                activeSlug && !isCourier && !isPlatformMode ? (
                  <OsWorkspaceTabs
                    navItems={navItems}
                    pathname={pathname}
                    lang={lang}
                    activeSlug={activeSlug}
                  />
                ) : undefined
              }
            >
              {children}
            </OsAppWindow>
          </main>
        </div>
      </div>

      {/* Level 3: Spotlight Command Palette */}
      <SpotlightCommandPalette open={spotlightOpen} onOpenChange={setSpotlightOpen} />
    </div>
  );
}
