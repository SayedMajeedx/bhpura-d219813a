import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import {
  DesktopStoreNavigation,
  MobileStorefrontDropdown,
} from "@/components/storefront/StorefrontNavigation";
import { CartDrawer } from "@/components/storefront/StorefrontCartDrawer";
import {
  HEADER_ICON,
  HeaderShoppingIcons,
  HeaderStoreSettings,
} from "@/components/storefront/HeaderActions";
import { isCatalogMode } from "@/lib/storefront-mode";
import { ShoppingBag, X, Search } from "lucide-react";
import { SearchOverlay } from "@/components/storefront/SearchOverlay";
import { CountBadge } from "@/components/motion/CountBadge";
import { useStorefrontCategories } from "@/lib/use-storefront-categories";
import { menuFitsOneRow } from "@/features/storefront-shell/lib/header-layout";

/** The logo on a laptop, at the size the store chose: the way home (the menu has no Home link). */
function DesktopLogo() {
  const { brand, settings, lang } = useStorefront();
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const logoSize = settings.logo_size || 40;
  return (
    <Link
      to="/$slug"
      params={{ slug: brand.slug }}
      className="flex min-h-11 shrink-0 items-center gap-3 min-w-0"
      style={{ color: "var(--sf-header-fg)" }}
      aria-label={displayName}
    >
      {settings.logo_url && (
        <img
          src={cloudflareImageUrl(settings.logo_url, 320)}
          alt={displayName}
          width={165}
          height={55}
          decoding="async"
          className="shrink-0 object-contain"
          style={{
            height: logoSize,
            maxHeight: Math.min(logoSize, 64),
            width: "auto",
            maxWidth: logoSize * 3,
          }}
        />
      )}
      {settings.show_header_name && (
        <span className="font-display text-lg sm:text-xl truncate">{displayName}</span>
      )}
    </Link>
  );
}

function StoreHeader() {
  const { brand, settings, lang, t, cartCount } = useStorefront();
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const align = settings.logo_align ?? "left";
  const logoSize = settings.logo_size || 40;
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const openSearch = () => setSearchOverlayOpen(true);
  const { data: categories = [] } = useStorefrontCategories();
  const centred = align === "center";
  const oneRow = menuFitsOneRow(
    categories
      .filter((c: any) => !c.parent_id)
      .map((c: any) => (lang === "ar" ? c.name_ar || c.name_en : c.name_en || c.name_ar) ?? ""),
    centred,
  );

  return (
    <header className="w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-col gap-2">
        {/* Phone header, one row: [Menu] [Logo] [Search] [Cart] */}
        <div className="flex md:hidden min-h-14 h-auto py-1 items-center justify-between gap-2">
          <div className="shrink-0">
            <MobileStorefrontDropdown />
          </div>

          <Link
            to="/$slug"
            params={{ slug: brand.slug }}
            className="flex min-h-11 items-center justify-center gap-2 min-w-0 flex-1 px-1"
            style={{ color: "var(--sf-header-fg)" }}
            aria-label={displayName}
          >
            {settings.logo_url && (
              <img
                src={cloudflareImageUrl(settings.logo_url, 240)}
                alt={displayName}
                width={130}
                height={40}
                // Eager, and still preloaded by React, at the browser's own priority: only the
                // hero's picture asks for the network first (PageSpeed, 2026-11-14).
                decoding="async"
                className="shrink-0 object-contain"
                style={{
                  height: logoSize,
                  maxHeight: Math.min(logoSize, 64),
                  width: "auto",
                  maxWidth: logoSize * 3,
                }}
              />
            )}
            {settings.show_header_name && (
              <span className="font-display text-base truncate font-semibold">{displayName}</span>
            )}
          </Link>

          <div
            className="flex items-center gap-1 shrink-0"
            style={{ color: "var(--sf-header-fg)" }}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full bg-transparent hover:bg-current/10 active:bg-current/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-current/80"
              style={{ color: "var(--sf-header-fg)" }}
              onClick={() => setSearchOverlayOpen(true)}
              aria-label={t("البحث", "Search")}
            >
              <Search className="h-5 w-5" />
            </Button>

            {!isCatalogMode(settings) && (
              <CartDrawer>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-11 w-11 rounded-full bg-transparent hover:bg-current/10 active:bg-current/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-current/80"
                  style={{ color: "var(--sf-header-fg)" }}
                  aria-label={t("سلة التسوق", "Shopping cart")}
                >
                  <ShoppingBag className="h-5 w-5" />
                  <CountBadge
                    count={cartCount}
                    placement="absolute top-1 end-1"
                    className="min-w-[18px] h-[18px] px-1 rounded-full text-xs font-semibold grid place-items-center"
                    style={{
                      backgroundColor: "var(--sf-btn-primary-bg)",
                      color: "var(--sf-btn-primary-fg)",
                    }}
                  />
                </Button>
              </CartDrawer>
            )}
          </div>
        </div>

        {/* Laptop: the logo leads, the shopping icons and the store's language and currency
            after it; the menu in the same row when it fits (header review of 2026-11-15). */}
        <div className="hidden md:block">
          {centred ? (
            <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
              <div className="justify-self-start" style={{ color: "var(--sf-header-fg)" }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={HEADER_ICON}
                  onClick={openSearch}
                  aria-label={t("البحث", "Search")}
                  title={t("البحث", "Search")}
                >
                  <Search className="h-5 w-5" strokeWidth={1.75} />
                </Button>
              </div>
              <DesktopLogo />
              <div className="flex items-center justify-self-end">
                <HeaderShoppingIcons />
                <HeaderStoreSettings />
              </div>
            </div>
          ) : (
            <div className="flex h-16 items-center gap-6">
              <DesktopLogo />
              {oneRow && (
                <DesktopStoreNavigation variant="inline" className="hidden flex-1 xl:block" />
              )}
              <div className={`flex-1 ${oneRow ? "xl:hidden" : ""}`} />
              <div className="flex shrink-0 items-center">
                <HeaderShoppingIcons onSearch={openSearch} />
                <HeaderStoreSettings />
              </div>
            </div>
          )}
        </div>
      </div>

      <DesktopStoreNavigation className={oneRow ? "xl:hidden" : ""} />

      <SearchOverlay isOpen={searchOverlayOpen} onClose={() => setSearchOverlayOpen(false)} />
    </header>
  );
}

function AnnouncementBar() {
  const { brand, settings, lang, session } = useStorefront();
  const { pathname } = useLocation();
  const text =
    lang === "ar"
      ? settings.announcement_text_ar || settings.announcement_text_en
      : settings.announcement_text_en || settings.announcement_text_ar;
  const key = `announcement-dismissed:${brand.id}:${text ?? ""}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(key) === "1") {
        setDismissed(true);
      }
    } catch {
      void 0;
    }
  }, [key]);
  const audienceOk =
    settings.announcement_audience === "all" ||
    (settings.announcement_audience === "guest" ? !session : Boolean(session));
  const relative = pathname.replace(`/${brand.slug}`, "") || "/";
  const scopeOk =
    settings.announcement_scope === "all" ||
    (settings.announcement_scope === "home" && relative === "/") ||
    (settings.announcement_scope === "checkout" && relative.startsWith("/checkout")) ||
    (settings.announcement_scope === "catalog" &&
      !relative.startsWith("/checkout") &&
      !relative.startsWith("/account") &&
      !relative.startsWith("/auth"));
  if (!settings.announcement_enabled || !text || dismissed || !audienceOk || !scopeOk) return null;
  return (
    <div
      className="relative px-12 py-2 text-center text-sm font-medium text-white"
      style={{
        backgroundColor: settings.announcement_bg || "#111111",
        color: settings.announcement_fg || "#ffffff",
        fontWeight: settings.announcement_bold ? 700 : 500,
        fontStyle: settings.announcement_italic ? "italic" : "normal",
      }}
    >
      <span>{text}</span>
      {settings.announcement_dismissible && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md hover:bg-current/15 opacity-80 hover:opacity-100"
          aria-label={lang === "ar" ? "إغلاق الإعلان" : "Dismiss announcement"}
          onClick={() => {
            try {
              sessionStorage.setItem(key, "1");
            } catch {
              void 0;
            }
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export { AnnouncementBar, StoreHeader };
