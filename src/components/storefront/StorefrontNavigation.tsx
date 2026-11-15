import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { isCurrentMenuLink } from "@/features/storefront-shell/lib/header-layout";
import { phoneMenuLinks } from "@/features/storefront-shell/lib/phone-menu";
import { useStorefrontCategories } from "@/lib/use-storefront-categories";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";
import { giftCardOnlineQueries } from "@/lib/data/gift-cards/online";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HEADER_ICON, HeaderStoreSettings } from "@/components/storefront/HeaderActions";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { isColorDark, hexToRgba } from "@/components/storefront/storefront-utils";
import { ChevronDown, Gift, Heart, Menu, PackageSearch, User } from "lucide-react";

/**
 * A category in the phone's menu: its name, large and plain, with a fine line under it; its
 * sub-categories open under it. A store's own icon for it stays, small; none is made up (each
 * row was a box with a grid icon).
 */
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
  const top = depth === 0;

  return (
    <li className={top ? "border-b border-current/10" : ""}>
      <div className="flex items-center gap-1">
        <Link
          to="/$slug/$category"
          params={{ slug: brand.slug, category: categorySlug }}
          onClick={close}
          className={`flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity duration-(--motion-quick) active:opacity-60 ${
            top ? "min-h-14 text-lg font-medium" : "min-h-11 text-sm opacity-80"
          }`}
        >
          {top && category.menu_icon_url && (
            <img
              src={cloudflareImageUrl(category.menu_icon_url, 80)}
              width={20}
              height={20}
              loading="lazy"
              decoding="async"
              alt=""
              className="h-5 w-5 shrink-0 object-contain"
            />
          )}
          <span className="line-clamp-2 break-words">{label}</span>
        </Link>
        {childCategories.length > 0 && (
          <Button
            type="button"
            variant="bar"
            size="icon"
            onClick={() => onToggleExpand(category.id)}
            className="h-11 w-11 shrink-0 rounded-full bg-transparent text-inherit hover:bg-current/10"
            aria-expanded={isExpanded}
            aria-label={
              lang === "ar"
                ? `${isExpanded ? "إخفاء" : "عرض"} أقسام ${label}`
                : `${isExpanded ? "Hide" : "Show"} ${label} categories`
            }
          >
            <ChevronDown
              className={`h-4 w-4 opacity-70 transition-transform duration-(--motion-fast) ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        )}
      </div>

      {childCategories.length > 0 && isExpanded && (
        <ul className="ms-1 mb-3 border-s border-current/15 ps-4 animate-in fade-in duration-(--motion-quick)">
          <li>
            <Link
              to="/$slug/$category"
              params={{ slug: brand.slug, category: categorySlug }}
              onClick={close}
              className="flex min-h-11 items-center text-sm font-medium"
            >
              {lang === "ar" ? `كل ${label}` : `All ${label}`}
            </Link>
          </li>
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
        </ul>
      )}
    </li>
  );
}

const SHOPPER_ICONS = {
  account: User,
  "sign-in": User,
  wishlist: Heart,
  "track-order": PackageSearch,
  "gift-cards": Gift,
} as const;

/**
 * The phone's menu (the header review of 2026-11-15): three thin lines in the bar, and a panel
 * with the store's categories as large plain names, then the shopper's own links (account,
 * wishlist, tracking, gift cards: `phoneMenuLinks`), the store's pages, and its language and
 * currency at the foot, as the laptop's header has them.
 */
function MobileStorefrontDropdown() {
  const { brand, settings, lang, t, session, isStoreMember, wishlistCount } = useStorefront();
  const servicesStore = useIsServicesStore();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const isGlass = settings.header_glass ?? true;
  const menuBackground =
    settings.menu_bg || settings.header_bg || settings.background_color || "#ffffff";
  const isDarkMenu = isColorDark(menuBackground);
  const menuText = settings.menu_fg || (isDarkMenu ? "#ffffff" : "#111111");
  const drawerBg = isGlass ? hexToRgba(menuBackground, 0.92) : menuBackground;
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const ownTitle =
    lang === "ar"
      ? settings.menu_title_ar || settings.menu_title_en
      : settings.menu_title_en || settings.menu_title_ar;

  const { data: categories = [] } = useStorefrontCategories({ enabled: isOpen });
  const sellsGiftCards = Boolean(
    useQuery({ ...giftCardOnlineQueries.offer(brand.slug), enabled: isOpen }).data,
  );
  const shopperLinks = phoneMenuLinks({
    signedIn: Boolean(session && isStoreMember),
    showAccount: settings.menu_show_account ?? true,
    showOrders: settings.menu_show_orders ?? true,
    servicesStore,
    sellsGiftCards,
  });

  const close = () => setIsOpen(false);

  const pages = settings.pages
    .map((page, index) => ({
      key: `${page.slug}-${index}`,
      slug: page.slug,
      title: lang === "ar" ? page.title_ar || page.title_en : page.title_en || page.title_ar,
    }))
    .filter((page) => settings.menu_show_pages && Boolean(page.title));

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="bar"
          size="icon"
          className={HEADER_ICON}
          style={{ color: "var(--sf-header-fg)" }}
          aria-label={t("القائمة", "Menu")}
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "right" : "left"}
        className={`w-[min(88vw,23rem)] border-e border-s border-current/15 p-0 flex flex-col h-full ${
          isGlass ? "backdrop-blur-2xl backdrop-saturate-150" : ""
        } [&>button]:top-4 [&>button]:grid [&>button]:h-11 [&>button]:w-11 [&>button]:place-items-center [&>button]:rounded-full [&>button]:text-inherit [&>button]:hover:bg-current/10 [&>button]:opacity-80 [&>button]:hover:opacity-100`}
        style={{ backgroundColor: drawerBg, color: menuText }}
      >
        {/* The store's own title for its menu, else its logo, else its name. Home is the
            menu's own row (the store's "Show Home link"), not a second link here. */}
        <SheetHeader className="flex min-h-20 shrink-0 justify-center px-6 pe-16">
          <SheetTitle className="flex min-h-11 items-center text-start" style={{ color: menuText }}>
            {!ownTitle && settings.logo_url ? (
              <img
                src={cloudflareImageUrl(settings.logo_url, 240)}
                alt={displayName}
                width={120}
                height={36}
                loading="lazy"
                decoding="async"
                className="h-9 w-auto max-w-40 object-contain"
              />
            ) : (
              <span className="font-display text-xl line-clamp-2 break-words">
                {ownTitle || displayName}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          <nav aria-label={t("الأقسام", "Categories")}>
            <ul className="border-t border-current/10">
              {settings.menu_show_home && (
                <li className="border-b border-current/10">
                  <Link
                    to="/$slug"
                    params={{ slug: brand.slug }}
                    onClick={close}
                    className="flex min-h-14 items-center text-lg font-medium active:opacity-60"
                  >
                    {t("الرئيسية", "Home")}
                  </Link>
                </li>
              )}
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
            </ul>
          </nav>

          <ul className="mt-6 space-y-0.5" aria-label={t("حسابك", "Your account")}>
            {shopperLinks.map((link) => {
              const Icon = SHOPPER_ICONS[link.key];
              return (
                <li key={link.key}>
                  <Link
                    to={link.to}
                    params={{ slug: brand.slug }}
                    search={
                      link.key === "sign-in"
                        ? {
                            redirect: mounted
                              ? window.location.pathname + window.location.search
                              : "",
                          }
                        : undefined
                    }
                    onClick={close}
                    className="flex min-h-11 items-center gap-3 text-sm active:opacity-60"
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0 opacity-70" strokeWidth={1.75} />
                    <span>{t(link.ar, link.en)}</span>
                    {link.key === "wishlist" && wishlistCount > 0 && (
                      <span className="ms-auto text-xs tabular-nums opacity-70">
                        {wishlistCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {pages.length > 0 && (
            <ul className="mt-6 space-y-0.5 border-t border-current/10 pt-4">
              {pages.map((page) => (
                <li key={page.key}>
                  <Link
                    to="/$slug/$category"
                    params={{ slug: brand.slug, category: page.slug }}
                    onClick={close}
                    className="flex min-h-11 items-center text-sm opacity-80 active:opacity-60"
                  >
                    <span className="line-clamp-2 break-words">{page.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The store's language and currency, as on the laptop's header. */}
        <div className="shrink-0 border-t border-current/10 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <HeaderStoreSettings inMenu onChanged={close} />
        </div>
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
