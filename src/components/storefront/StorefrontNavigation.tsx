import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { isCurrentMenuLink } from "@/features/storefront-shell/lib/header-layout";
import { useStorefrontCategories } from "@/lib/use-storefront-categories";
import { useStorefront } from "@/lib/storefront-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { isColorDark, hexToRgba } from "@/components/storefront/storefront-utils";
import {
  Menu,
  Home,
  PackageSearch,
  FileText,
  LogIn,
  ChevronDown,
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
      <div className="flex items-center gap-1 rounded-[var(--radius)] border border-current/15 bg-current/10 transition-colors hover:bg-current/20 active:bg-current/30 pe-1.5 rtl:pe-0 rtl:ps-1.5">
        <Link
          to="/$slug/$category"
          params={{ slug: brand.slug, category: categorySlug }}
          onClick={close}
          className="flex min-h-12 flex-1 items-center gap-3 px-2.5 py-2 min-w-0"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-current/15">
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
            className="h-11 w-11 p-0 shrink-0 rounded-lg hover:bg-black/5 text-muted-foreground hover:text-foreground transition duration-(--motion-fast)"
            aria-expanded={isExpanded}
            aria-label={lang === "ar" ? "توسيع" : "Expand"}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-(--motion-fast) ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        )}
      </div>

      {childCategories.length > 0 && isExpanded && (
        <div className="ms-4 ps-3 border-s border-muted-foreground/15 space-y-1.5 animate-in slide-in-from-top-1 duration-(--motion-fast)">
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
  const isGlass = settings.header_glass ?? true;
  const menuBackground =
    settings.menu_bg || settings.header_bg || settings.background_color || "#ffffff";
  const isDarkMenu = isColorDark(menuBackground);
  const menuText = settings.menu_fg || (isDarkMenu ? "#ffffff" : "#111111");
  const drawerBg = isGlass ? hexToRgba(menuBackground, 0.65) : menuBackground;

  const { data: categories = [] } = useStorefrontCategories({ enabled: isOpen });

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
          className="flex h-11 items-center gap-2 px-3 font-medium rounded-[var(--radius)] border border-current/20 bg-current/10 hover:bg-current/20 active:bg-current/30 text-inherit shadow-none transition duration-(--motion-fast)"
          style={{ color: "var(--sf-header-fg)" }}
        >
          <Grid2X2 className="h-4 w-4" />
          <span>{t("القائمة", "Menu")}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "right" : "left"}
        className={`w-[min(88vw,23rem)] border-e border-s border-current/20 p-0 flex flex-col h-full ${
          isGlass ? "backdrop-blur-2xl backdrop-saturate-150" : ""
        } [&>button]:top-4 [&>button]:grid [&>button]:h-9 [&>button]:w-9 [&>button]:place-items-center [&>button]:rounded-md [&>button]:text-inherit [&>button]:hover:bg-current/10 [&>button]:opacity-80 [&>button]:hover:opacity-100`}
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
                          width={20}
                          height={20}
                          loading="lazy"
                          decoding="async"
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
            className="h-8 px-3 text-xs font-bold gap-1.5 border-current/20 bg-current/5 hover:bg-current/10"
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

  const isGlass = settings.header_glass ?? true;
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
              ? "h-11 shrink-0 rounded-[var(--radius)] border border-current/20 bg-current/10 hover:bg-current/20 active:bg-current/30 text-inherit font-semibold shadow-none"
              : "bg-transparent hover:bg-current/10 active:bg-current/20 text-inherit border-0 shadow-none"
          } gap-2 transition duration-(--motion-fast)`}
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
        className={`flex h-full w-[min(90vw,400px)] flex-col overflow-hidden border-e border-s border-current/20 p-0 shadow-2xl ${
          isGlass ? "backdrop-blur-2xl backdrop-saturate-150" : ""
        } [&>button]:top-5 [&>button]:grid [&>button]:h-9 [&>button]:w-9 [&>button]:place-items-center [&>button]:rounded-md [&>button]:text-inherit [&>button]:hover:bg-current/10 [&>button]:opacity-80 [&>button]:hover:opacity-100 ${
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
                  <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-current/5 p-1">
                    <img
                      src={cloudflareImageUrl(settings.logo_url, 320)}
                      alt={displayName}
                      width={88}
                      height={56}
                      loading="lazy"
                      decoding="async"
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
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-current/10 active:bg-current/20"
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
                      className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-current/10 active:bg-current/20"
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
                      className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-current/10 active:bg-current/20"
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
                    className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-current/10 active:bg-current/20"
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
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-start transition-colors hover:bg-current/10 active:bg-current/20"
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
            <div className="flex items-center justify-between rounded-lg transition hover:bg-muted/40">
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
                  className="p-1 me-1 text-muted-foreground transition duration-(--motion-fast) shrink-0 cursor-pointer hover:text-foreground hover:bg-muted rounded-md"
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
                    className={`h-3 w-3 transition-transform duration-(--motion-fast) ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              )}
            </div>

            {hasChildren && isExpanded && (
              <div className="vertical-submenu mt-0.5 ms-3 ps-3 border-s border-border animate-in fade-in duration-(--motion-quick)">
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

/**
 * A sale link stands out by weight and an underline in the bar's own colour: a fixed red read
 * 2.6:1 on Pura's mauve bar, a colour from no store's palette.
 */
const SALE_LINK = "font-bold underline decoration-2 underline-offset-4";

/**
 * A menu link: the bar's own colour, a fine line under the page being shown and, for a mouse,
 * under the one pointed at. No box and no lift (the header review of 2026-11-15). Latin names get
 * a little tracking; Arabic is never tracked.
 */
const MENU_LINK =
  "relative inline-flex min-h-11 items-center gap-1 whitespace-nowrap px-3 text-sm font-medium ltr:tracking-wide transition-opacity duration-(--motion-quick) hover:opacity-80 after:pointer-events-none after:absolute after:inset-x-3 after:bottom-2 after:h-px after:origin-center after:scale-x-0 after:bg-current after:transition-transform after:duration-(--motion-fast) hover:after:scale-x-100 aria-[current=page]:after:scale-x-100";

/**
 * The store's top categories on a laptop: in the logo's row (`inline`) or as a row of its own
 * under it (`row`). The logo is the way home, so there is no Home link.
 */
function DesktopStoreNavigation({
  variant = "row",
  className = "",
}: {
  variant?: "row" | "inline";
  className?: string;
}) {
  const { brand, lang } = useStorefront();
  const { data = [] } = useStorefrontCategories();
  const { pathname } = useLocation();

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
  if (mainCategories.length === 0) return null;

  const linkClass = (c: any) => `${MENU_LINK} ${isSale(c) ? `${SALE_LINK} after:hidden` : ""}`;

  return (
    <nav
      aria-label={lang === "ar" ? "الأقسام" : "Categories"}
      className={
        variant === "row"
          ? `hidden border-t border-current/10 md:block overflow-visible ${className}`
          : `min-w-0 overflow-visible ${className}`
      }
    >
      <div
        className={
          variant === "row"
            ? "mx-auto flex min-h-12 max-w-7xl flex-wrap items-center justify-center gap-x-4 px-6"
            : "flex items-center justify-center gap-x-1"
        }
      >
        {mainCategories.map((c: any) => {
          const subs = data.filter((sub: any) => sub.parent_id === c.id);
          const name = lang === "ar" ? c.name_ar || c.name_en : c.name_en || c.name_ar;
          const url = c.slug || c.name_en;
          const hasDropdown = subs.length > 0;
          const isOpen = activeDropdownId === c.id;
          const current = isCurrentMenuLink(pathname, brand.slug, url) ? "page" : undefined;

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
                  aria-current={current}
                  className={linkClass(c)}
                >
                  <span>{name}</span>
                  <ChevronDown
                    aria-hidden
                    className={`h-3.5 w-3.5 opacity-60 transition-transform duration-(--motion-fast) ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </Link>
                {/* State-controlled dropdown menu card with unmount-on-exit */}
                {isOpen && (
                  <div className="absolute top-full left-1/2 z-50 pt-2 min-w-[230px] -translate-x-1/2">
                    <div className="rounded-2xl border border-border bg-background p-3 shadow-xl transition duration-(--motion-fast) animate-in fade-in-0 slide-in-from-top-1 text-foreground">
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
              aria-current={current}
              className={`shrink-0 ${linkClass(c)}`}
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

export { DesktopStoreNavigation, MobileStorefrontDropdown };
