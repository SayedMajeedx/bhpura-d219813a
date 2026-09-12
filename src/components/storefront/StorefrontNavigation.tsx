import React, { useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { publicSupabase as supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { isColorDark, hexToRgba } from "@/components/storefront/storefront-utils";
import {
  Search,
  Menu,
  Home,
  PackageSearch,
  FileText,
  LogIn,
  ChevronDown,
  Sparkles,
  X,
  Languages,
  User,
  Grid2X2,
} from "lucide-react";

function NavCategoryItem({
  category,
  categories,
  expandedCategories,
  onToggleExpand,
  brand,
  lang,
  close,
  depth = 0,
}: {
  category: any;
  categories: any[];
  expandedCategories: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  brand: any;
  lang: string;
  close: () => void;
  depth?: number;
}) {
  const categorySlug = category.slug || category.name_en;
  const label =
    lang === "ar" ? category.name_ar || category.name_en : category.name_en || category.name_ar;
  const childCategories = categories.filter((sub: any) => sub.parent_id === category.id);
  const isExpanded = !!expandedCategories[category.id];

  const toggleExpand = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleExpand(category.id);
  };

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center gap-1 rounded-[var(--radius)] border border-white/15 bg-white/10 transition-colors hover:bg-white/20 active:bg-white/30 pe-1.5 rtl:pe-0 rtl:ps-1.5">
        <Link
          to="/$slug/$category"
          params={{ slug: brand.slug, category: categorySlug }}
          onClick={close}
          className="flex min-h-12 flex-1 items-center gap-3 px-2.5 py-2 min-w-0"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/15">
            {category.menu_icon_url ? (
              <img
                src={cloudflareImageUrl(category.menu_icon_url, 80)}
                width={20}
                height={20}
                loading="lazy"
                decoding="async"
                alt=""
                className="h-5 w-5 object-contain"
              />
            ) : (
              <Grid2X2 className="h-4 w-4 opacity-50" />
            )}
          </div>
          <span className="truncate font-medium text-start text-sm">{label}</span>
        </Link>
        {childCategories.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleExpand}
            className="h-11 w-11 p-0 shrink-0 rounded-lg hover:bg-black/5 text-muted-foreground hover:text-foreground transition-all duration-200"
            aria-expanded={isExpanded}
            aria-label={lang === "ar" ? "توسيع" : "Expand"}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        )}
      </div>

      {childCategories.length > 0 && isExpanded && (
        <div className="ms-4 ps-3 border-s border-muted-foreground/15 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
          <Link
            to="/$slug/$category"
            params={{ slug: brand.slug, category: categorySlug }}
            onClick={close}
            className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-black/5 text-muted-foreground hover:text-foreground font-semibold"
          >
            <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/30">
              <Grid2X2 className="h-3.5 w-3.5 opacity-30" />
            </div>
            <span className="truncate text-xs">{lang === "ar" ? "عرض الكل" : "View All"}</span>
          </Link>
          {childCategories.map((sub: any) => (
            <NavCategoryItem
              key={sub.id}
              category={sub}
              categories={categories}
              expandedCategories={expandedCategories}
              onToggleExpand={onToggleExpand}
              brand={brand}
              lang={lang}
              close={close}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileStorefrontDropdown() {
  const { brand, settings, lang, setLang, t } = useStorefront();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [localGlass, setLocalGlass] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const storedG = localStorage.getItem("boutq_header_glass");
      if (storedG !== null) {
        setLocalGlass(storedG === "true");
      }
    } catch (_ignored) {
      void 0;
    }
  }, []);

  const isGlass = localGlass !== null ? localGlass : (settings.header_glass ?? true);
  const menuBackground =
    settings.menu_bg || settings.header_bg || settings.background_color || "#ffffff";
  const isDarkMenu = isColorDark(menuBackground);
  const menuText = settings.menu_fg || (isDarkMenu ? "#ffffff" : "#111111");
  const drawerBg = isGlass ? hexToRgba(menuBackground, 0.65) : menuBackground;

  const { data: categories = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "categories"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, parent_id, slug, image_url, menu_icon_url, sort_order")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isOpen,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const close = () => {
    setIsOpen(false);
  };

  const pages = settings.pages
    .map((page, index) => ({
      key: `${page.slug}-${index}`,
      slug: page.slug,
      title: lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar,
      iconUrl: page.menu_icon_url,
    }))
    .filter((page) => settings.menu_show_pages && Boolean(page.title));

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-11 items-center gap-2 px-3 font-medium rounded-[var(--radius)] border border-white/20 bg-white/10 hover:bg-white/20 active:bg-white/30 text-inherit shadow-none transition-all duration-200"
          style={{ color: "var(--sf-header-fg)" }}
        >
          <Grid2X2 className="h-4 w-4" />
          <span>{t("القائمة", "Menu")}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "right" : "left"}
        className={`w-[min(88vw,23rem)] border-e border-s border-white/20 p-0 flex flex-col h-full ${
          isGlass ? "backdrop-blur-2xl backdrop-saturate-150" : ""
        } [&>button]:top-4 [&>button]:grid [&>button]:h-9 [&>button]:w-9 [&>button]:place-items-center [&>button]:rounded-md [&>button]:text-inherit [&>button]:hover:bg-white/10 [&>button]:opacity-80 [&>button]:hover:opacity-100`}
        style={{
          backgroundColor: drawerBg,
          color: menuText,
        }}
      >
        <SheetHeader className="px-4 pt-5 pb-3 border-b border-border-subtle shrink-0">
          <SheetTitle
            className="text-start text-base font-semibold flex items-center gap-2"
            style={{ color: menuText }}
          >
            <Grid2X2 className="h-5 w-5" />
            {t("القائمة", "Menu")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 overscroll-contain">
          {/* Categories Block */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-65">
              <Grid2X2 className="h-4 w-4" />
              {t("الأقسام", "Categories")}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {categories
                .filter((c: any) => !c.parent_id)
                .map((category: any) => (
                  <NavCategoryItem
                    key={category.id}
                    category={category}
                    categories={categories}
                    expandedCategories={expandedCategories}
                    onToggleExpand={(id) =>
                      setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }))
                    }
                    brand={brand}
                    lang={lang}
                    close={close}
                  />
                ))}
            </div>
          </div>

          {/* Pages Block */}
          {pages.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border-subtle">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-65">
                <FileText className="h-4 w-4" />
                {t("الصفحات", "Pages")}
              </div>
              <div className="space-y-1">
                {pages.map((page) => (
                  <Link
                    key={page.key}
                    to="/$slug/$category"
                    params={{ slug: brand.slug, category: page.slug }}
                    onClick={close}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-black/5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/5">
                      {page.iconUrl ? (
                        <img
                          src={cloudflareImageUrl(page.iconUrl, 80)}
                          // Decorative icon next to visible title label
                          alt=""
                          className="h-5 w-5 object-contain"
                        />
                      ) : (
                        <FileText className="h-4 w-4 opacity-60" />
                      )}
                    </span>
                    <span className="truncate text-sm font-medium">{page.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Language Toggle */}
        <div className="p-4 border-t border-border-subtle shrink-0 flex items-center justify-between">
          <span className="text-xs font-semibold opacity-70 flex items-center gap-2">
            <Languages className="h-4 w-4" />
            {t("لغة المتجر", "Store Language")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLang(lang === "ar" ? "en" : "ar");
              close();
            }}
            className="h-8 px-3 text-xs font-bold gap-1.5 border-white/20 bg-white/5 hover:bg-white/10"
          >
            <span>{lang === "ar" ? "English" : "العربية"}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function StorefrontMenu({ navigation = false }: { navigation?: boolean } = {}) {
  const { brand, settings, lang, t, session, isStoreMember } = useStorefront();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [localGlass, setLocalGlass] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const storedG = localStorage.getItem("boutq_header_glass");
      if (storedG !== null) {
        setLocalGlass(storedG === "true");
      }
    } catch {
      void 0;
    }
  }, []);

  const isGlass = localGlass !== null ? localGlass : (settings.header_glass ?? true);
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const menuTitle =
    (lang === "ar"
      ? settings.menu_title_ar || settings.menu_title_en
      : settings.menu_title_en || settings.menu_title_ar) || displayName;
  const menuBg = settings.menu_bg || settings.header_bg || settings.background_color || "#ffffff";
  const isDarkMenu = isColorDark(menuBg);
  const menuFg = settings.menu_fg || (isDarkMenu ? "#ffffff" : "#111111");
  const drawerBg = isGlass ? hexToRgba(menuBg, 0.65) : menuBg;

  const pageLinks = settings.pages
    .map((page, index) => ({
      index: index + 1,
      slug: page.slug,
      title: lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar,
    }))
    .filter((page) => settings.menu_show_pages && Boolean(page.title));
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size={navigation ? "default" : "sm"}
          className={`${
            navigation
              ? "h-11 shrink-0 rounded-[var(--radius)] border border-white/20 bg-white/10 hover:bg-white/20 active:bg-white/30 text-inherit font-semibold shadow-none"
              : "bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none"
          } gap-2 transition-all duration-200`}
          style={{ color: "var(--sf-header-fg)" }}
          aria-label={t("القائمة", "Menu")}
        >
          <Menu className="h-5 w-5" />
          <span className={navigation ? "inline" : "hidden lg:inline"}>
            {navigation ? t("كل الأقسام", "All categories") : t("القائمة", "Menu")}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "right" : "left"}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`flex h-full w-[min(90vw,400px)] flex-col overflow-hidden border-e border-s border-white/20 p-0 shadow-2xl ${
          isGlass ? "backdrop-blur-2xl backdrop-saturate-150" : ""
        } [&>button]:top-5 [&>button]:grid [&>button]:h-9 [&>button]:w-9 [&>button]:place-items-center [&>button]:rounded-md [&>button]:text-inherit [&>button]:hover:bg-white/10 [&>button]:opacity-80 [&>button]:hover:opacity-100 ${
          lang === "ar" ? "[&>button]:left-5 [&>button]:right-auto" : "[&>button]:right-5"
        }`}
        style={{ backgroundColor: drawerBg, color: menuFg, zIndex: 60 }}
      >
        {open && (
          <>
            <div
              className="relative shrink-0 overflow-hidden border-b px-6 pb-6 pt-7 pe-20"
              style={{ borderColor: "rgba(127,127,127,.18)" }}
            >
              <div
                className="pointer-events-none absolute -end-16 -top-24 h-52 w-52 rounded-full opacity-[0.08]"
                style={{ backgroundColor: settings.primary_color }}
              />
              <div className="relative flex min-w-0 items-center gap-4">
                {settings.logo_url && (
                  <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5 p-1">
                    <img
                      src={cloudflareImageUrl(settings.logo_url, 320)}
                      alt={displayName}
                      className="block max-h-full max-w-full object-contain"
                      style={{ width: "auto", height: "auto" }}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 text-start">
                  <SheetTitle className="truncate text-2xl font-display" style={{ color: menuFg }}>
                    {menuTitle}
                  </SheetTitle>
                  <p className="mt-1 truncate text-xs opacity-65">
                    {t("اكتشف المتجر", "Explore our store")}
                  </p>
                </div>
              </div>
            </div>
            <nav
              className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4"
              style={{ scrollbarWidth: "none" }}
            >
              {settings.menu_show_home && (
                <Link
                  to="/$slug"
                  params={{ slug: brand.slug }}
                  onClick={close}
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                  style={{ color: menuFg }}
                >
                  <Home className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{t("الرئيسية", "Home")}</span>
                </Link>
              )}
              {session && isStoreMember ? (
                <>
                  {settings.menu_show_account && (
                    <Link
                      to="/$slug/account"
                      params={{ slug: brand.slug }}
                      onClick={close}
                      className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                      style={{ color: menuFg }}
                    >
                      <User className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 truncate">{t("حسابي", "My account")}</span>
                    </Link>
                  )}
                  {settings.menu_show_orders && (
                    <Link
                      to="/$slug/account"
                      params={{ slug: brand.slug }}
                      onClick={close}
                      className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                      style={{ color: menuFg }}
                    >
                      <PackageSearch className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 truncate">{t("طلباتي", "My orders")}</span>
                    </Link>
                  )}
                </>
              ) : (
                settings.menu_show_account && (
                  <Link
                    to="/$slug/auth"
                    params={{ slug: brand.slug }}
                    search={{
                      redirect: mounted ? window.location.pathname + window.location.search : "",
                    }}
                    onClick={close}
                    className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                    style={{ color: menuFg }}
                  >
                    <LogIn className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 truncate">{t("تسجيل الدخول", "Sign in")}</span>
                  </Link>
                )
              )}
              {pageLinks.length > 0 && (
                <div className="my-3 border-t" style={{ borderColor: "rgba(127,127,127,.18)" }} />
              )}
              {pageLinks.map((page) => (
                <Link
                  key={page.index}
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: page.slug }}
                  onClick={close}
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-white/10 active:bg-white/20"
                  style={{ color: menuFg }}
                >
                  <FileText className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{page.title}</span>
                </Link>
              ))}
            </nav>
            <div
              className="m-4 mt-2 shrink-0 rounded-2xl border p-5 text-start text-sm"
              style={{ backgroundColor: menuBg, borderColor: `${settings.primary_color}55` }}
            >
              <p className="font-medium" style={{ color: menuFg }}>
                {t("تسوق بكل سهولة", "Shopping made simple")}
              </p>
              <p className="mt-1 opacity-65">
                {t(
                  "تصفح المنتجات وتابع طلباتك من مكان واحد.",
                  "Browse products and follow your orders in one place.",
                )}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DesktopSubMenu({
  parentCategoryId,
  categories,
  brand,
  lang,
  close,
  depth = 0,
}: {
  parentCategoryId: string;
  categories: any[];
  brand: any;
  lang: string;
  close: () => void;
  depth?: number;
}) {
  const subs = categories.filter((sub) => sub.parent_id === parentCategoryId);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (subs.length === 0) return null;

  return (
    <div className="space-y-1">
      {subs.map((sub) => {
        const name = lang === "ar" ? sub.name_ar || sub.name_en : sub.name_en || sub.name_ar;
        const url = sub.slug || sub.name_en;
        const children = categories.filter((c) => c.parent_id === sub.id);
        const hasChildren = children.length > 0;
        const isExpanded = activeId === sub.id;

        return (
          <div key={sub.id} className="w-full">
            <div className="flex items-center justify-between rounded-lg transition-all hover:bg-muted/40">
              <Link
                to="/$slug/$category"
                params={{ slug: brand.slug, category: url }}
                onClick={(e) => {
                  if (hasChildren) {
                    if (!isExpanded) {
                      // First click: expand dropdown, prevent direct navigation
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveId(sub.id);
                    } else {
                      // Second click: navigate to URL and close entire menu
                      close();
                    }
                  } else {
                    // No children: navigate immediately and close
                    close();
                  }
                }}
                className="flex-1 px-3 py-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors truncate text-start"
              >
                {name}
              </Link>
              {hasChildren && (
                <div
                  className="p-1 me-1 text-muted-foreground transition-all duration-200 shrink-0 cursor-pointer hover:text-foreground hover:bg-muted rounded-md"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isExpanded) {
                      setActiveId(null);
                    } else {
                      setActiveId(sub.id);
                    }
                  }}
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              )}
            </div>

            {hasChildren && isExpanded && (
              <div className="vertical-submenu mt-0.5 ms-3 ps-3 border-s border-border animate-in fade-in duration-150">
                <DesktopSubMenu
                  parentCategoryId={sub.id}
                  categories={categories}
                  brand={brand}
                  lang={lang}
                  close={close}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DesktopStoreNavigation() {
  const { brand, lang, t } = useStorefront();
  const { data = [] } = useQuery({
    queryKey: ["storefront", brand.slug, "categories"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, parent_id, slug, sort_order")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isSale = (c: any) =>
    /sale|offers?|discount|تنزيل|عروض/i.test(
      `${c.slug ?? ""} ${c.name_en ?? ""} ${c.name_ar ?? ""}`,
    );

  const handleMouseEnter = (id: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveDropdownId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setActiveDropdownId(null);
    }, 300); // 300ms hover-intent delay before unmounting dropdown completely on leave
  };

  // Only direct top-level (parent) categories should be rendered as main navigation items
  const mainCategories = data.filter((c: any) => !c.parent_id);

  return (
    <nav className="hidden border-t border-white/10 md:block overflow-visible">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-center gap-2 flex-wrap px-6 py-2 overflow-visible">
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="shrink-0 rounded-[var(--radius)] border border-dashed border-current/30 px-5 py-2.5 font-semibold transition hover:-translate-y-0.5 hover:bg-current/10"
        >
          {t("الصفحة الرئيسية", "Home")}
        </Link>
        {mainCategories.map((c: any) => {
          const subs = data.filter((sub: any) => sub.parent_id === c.id);
          const name = lang === "ar" ? c.name_ar || c.name_en : c.name_en || c.name_ar;
          const url = c.slug || c.name_en;
          const hasDropdown = subs.length > 0;
          const isOpen = activeDropdownId === c.id;

          if (hasDropdown) {
            return (
              <div
                key={c.id}
                className="relative group shrink-0 overflow-visible"
                onMouseEnter={() => handleMouseEnter(c.id)}
                onMouseLeave={handleMouseLeave}
              >
                <Link
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: url }}
                  className={`flex items-center gap-1.5 rounded-[var(--radius)] px-5 py-2.5 text-base font-semibold transition hover:-translate-y-0.5 hover:bg-current/10 ${
                    isSale(c) ? "font-bold text-red-500" : ""
                  }`}
                >
                  <span>{name}</span>
                  <svg
                    className={`h-3.5 w-3.5 opacity-70 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </Link>
                {/* State-controlled dropdown menu card with unmount-on-exit */}
                {isOpen && (
                  <div className="absolute top-full left-1/2 z-50 pt-2 min-w-[230px] -translate-x-1/2">
                    <div className="rounded-2xl border border-border bg-background p-3 shadow-xl transition-all duration-200 animate-in fade-in-0 slide-in-from-top-1 text-foreground">
                      <DesktopSubMenu
                        parentCategoryId={c.id}
                        categories={data}
                        brand={brand}
                        lang={lang}
                        close={() => setActiveDropdownId(null)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={c.id}
              to="/$slug/$category"
              params={{ slug: brand.slug, category: url }}
              className={`shrink-0 rounded-[var(--radius)] px-5 py-2.5 text-base transition hover:-translate-y-0.5 hover:bg-current/10 ${
                isSale(c) ? "font-bold text-red-500" : "font-semibold"
              }`}
              onMouseEnter={() => {
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                }
                setActiveDropdownId(null);
              }}
            >
              {name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SearchBar() {
  const { brand, lang, t, currency } = useStorefront();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["storefront", brand.slug, "live-search", debounced],
    enabled: modalOpen && debounced.length >= 2,
    queryFn: async () => {
      const pattern = `%${debounced.replace(/[%_]/g, (m: string) => `\\${m}`)}%`;
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_ar, name_en, category, image_url, media, product_variants(selling_price, original_price)",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .or(`name.ilike.${pattern},name_ar.ilike.${pattern},name_en.ilike.${pattern}`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        name: string;
        name_ar: string | null;
        name_en: string | null;
        category: string | null;
        image_url: string | null;
        media: Array<{ type: "image" | "video"; url: string }> | null;
        product_variants: Array<{ selling_price: number; original_price: number | null }>;
      }>;
    },
    staleTime: 15_000,
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["storefront", brand.slug, "categories"],
    enabled: modalOpen,
  });

  const topCategories = useMemo(() => {
    return categories.filter((c: any) => !c.parent_id).slice(0, 6);
  }, [categories]);

  const results = data ?? [];
  const searchLabel = t("البحث في المتجر", "Search store");
  const searchPlaceholder = t("ابحث عن منتج...", "Search for products...");

  return (
    <>
      {/* Search Input Trigger inside the page headers */}
      <Button
        type="button"
        variant="outline"
        aria-label={searchLabel}
        aria-haspopup="dialog"
        className="relative flex h-11 w-full justify-start font-normal rounded-[var(--radius)] border bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background ps-9 pe-3"
        style={{
          borderColor: "rgba(128, 128, 128, 0.25)",
        }}
        onClick={() => setModalOpen(true)}
      >
        <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 opacity-70 start-3" />
        <span className="truncate opacity-80">{searchPlaceholder}</span>
      </Button>

      {/* Premium backdrop-blurred modal dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="sm:max-w-2xl gap-0 p-0 overflow-hidden bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl [&>button]:text-muted-foreground [&>button]:hover:text-foreground [&>button]:top-5"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <DialogHeader className="p-4 border-b border-border flex flex-row items-center gap-2">
            <Search className="h-5 w-5 opacity-60 shrink-0" />
            <DialogTitle className="sr-only">{t("البحث", "Search")}</DialogTitle>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const query = q.trim();
                if (!query) return;
                setModalOpen(false);
                navigate({
                  to: "/$slug/search",
                  params: { slug: brand.slug },
                  search: { q: query },
                });
              }}
              className="flex-1"
            >
              <input
                id="storefront-search"
                name="storefront-search"
                type="search"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("اكتب اسم المنتج للبحث السريع...", "Type to search products...")}
                className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-base py-1 px-1 font-medium"
              />
            </form>
            {q && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setQ("")}
                aria-label={t("مسح البحث", "Clear search")}
                className="h-8 w-8 rounded-md shrink-0 me-6"
              >
                <X className="h-4 w-4 opacity-70" />
              </Button>
            )}
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
            {/* suggestions if query is too short */}
            {debounced.length < 2 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                  <span>{t("اكتشف الأقسام المميزة", "Explore Featured Categories")}</span>
                </div>
                {topCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {topCategories.map((cat: any) => {
                      const catName =
                        lang === "ar" ? cat.name_ar || cat.name_en : cat.name_en || cat.name_ar;
                      return (
                        <Link
                          key={cat.id}
                          to="/$slug/$category"
                          params={{ slug: brand.slug, category: cat.slug }}
                          onClick={() => setModalOpen(false)}
                          className="px-3.5 py-1.5 rounded-full border border-border text-xs font-medium bg-muted hover:bg-muted/80 transition-all cursor-pointer"
                        >
                          {catName}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {t(
                      "ابدأ بكتابة حرفين أو أكثر لبدء البحث الفوري.",
                      "Type 2 or more characters to start instant searching.",
                    )}
                  </div>
                )}
              </div>
            )}

            {/* active search results or loader */}
            {debounced.length >= 2 && (
              <div className="space-y-2">
                {isFetching && (
                  <div className="space-y-3 py-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="h-12 w-12 rounded bg-muted shrink-0" />
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="h-4 bg-muted rounded w-2/3" />
                          <div className="h-3 bg-muted rounded w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isFetching && results.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("لا توجد نتائج مطابقة", "No products found matching your query")}
                  </div>
                )}

                {!isFetching && results.length > 0 && (
                  <ul className="divide-y divide-border">
                    {results.map((p: any) => {
                      const displayName = pickName(lang, p);
                      const price = p.product_variants?.[0]?.selling_price ?? 0;
                      const oldPrice = Number(p.product_variants?.[0]?.original_price ?? 0);
                      const imageUrl =
                        p.image_url ||
                        p.media?.find((item: any) => item.type === "image")?.url ||
                        null;
                      const discount =
                        oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;

                      return (
                        <li key={p.id} className="first:pt-0 last:pb-0 py-2.5">
                          <Link
                            to="/$slug/product/$id"
                            params={{ slug: brand.slug, id: p.id }}
                            onClick={() => {
                              setModalOpen(false);
                              setQ("");
                            }}
                            className="flex items-center gap-3 group"
                          >
                            <div className="h-12 w-12 shrink-0 rounded-lg bg-muted border border-border overflow-hidden relative">
                              {imageUrl && (
                                <img
                                  src={cloudflareImageUrl(imageUrl, 120)}
                                  alt={displayName}
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 text-start">
                              <div
                                className="text-sm font-semibold truncate group-hover:text-amber-500 transition-colors"
                                style={{ color: "var(--sf-heading)" }}
                              >
                                {displayName}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">
                                  {formatPrice(Number(price), currency, lang)}
                                </span>
                                {oldPrice > Number(price) && (
                                  <>
                                    <span className="line-through text-xs">
                                      {formatPrice(oldPrice, currency, lang)}
                                    </span>
                                    {discount > 0 && (
                                      <span className="text-xs px-1.5 py-0.2 rounded-full bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-400 font-medium">
                                        {discount}% {t("خصم", "OFF")}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { DesktopStoreNavigation, SearchBar, MobileStorefrontDropdown };
