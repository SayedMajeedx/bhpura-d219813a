import{ useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { isColorDark } from "@/components/storefront/storefront-utils";
import { SearchBar, MobileStorefrontDropdown } from "@/components/storefront/StorefrontNavigation";
import { CartDrawer } from "@/components/storefront/StorefrontCartDrawer";
import {
  ShoppingBag,
  Heart,
  User,
  Languages,
  X,
  Bell,
} from "lucide-react";

function StoreHeader() {
  const { brand, settings, lang, setLang, t, cartCount, session, isStoreMember, wishlistCount } =
    useStorefront();
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const align = settings.logo_align ?? "left";
  const logoSize = settings.logo_size || 40;
  const [mounted, setMounted] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-col gap-2">
        <div className="h-14 flex items-center gap-3 justify-between">
          <Link
            to="/$slug"
            params={{ slug: brand.slug }}
            className={`flex min-h-11 items-center gap-3 min-w-0 ${align === "center" ? "sm:mx-auto" : ""}`}
            style={{ color: "var(--sf-header-fg)" }}
            aria-label={displayName}
          >
            {settings.logo_url && (
              <img
                src={cloudflareImageUrl(settings.logo_url, 320)}
                alt={displayName}
                width={165}
                height={55}
                fetchPriority="high"
                decoding="async"
                className="shrink-0 object-contain"
                style={{
                  height: logoSize,
                  maxHeight: logoSize,
                  width: "auto",
                  maxWidth: logoSize * 3,
                }}
              />
            )}

            {settings.show_header_name && (
              <span
                className="font-display text-lg sm:text-xl truncate"
                style={{ color: "var(--sf-header-fg)" }}
              >
                {displayName}
              </span>
            )}
          </Link>
          {/* Desktop search */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <SearchBar />
          </div>

          <div
            className="flex items-center gap-1 sm:gap-2 shrink-0"
            style={{ color: "var(--sf-header-fg)" }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-white/80"
              style={{ color: "var(--sf-header-fg)" }}
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              aria-label={
                lang === "ar" ? "تغيير اللغة إلى الإنجليزية" : "Switch language to Arabic"
              }
            >
              <Languages className="h-4 w-4" />
              <span className="hidden sm:inline">{lang === "ar" ? "English" : "العربية"}</span>
            </Button>

            {session && isStoreMember ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-white/80"
                style={{ color: "var(--sf-header-fg)" }}
              >
                <Link
                  to="/$slug/account"
                  params={{ slug: brand.slug }}
                  title={session.user?.email ?? ""}
                  aria-label={t("لوحة التحكم", "Dashboard")}
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {t("لوحة التحكم", "Dashboard")}
                  </span>
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-white/80"
                style={{ color: "var(--sf-header-fg)" }}
              >
                <Link
                  to="/$slug/auth"
                  params={{ slug: brand.slug }}
                  search={{
                    redirect: mounted ? window.location.pathname + window.location.search : "",
                  }}
                  aria-label={t("دخول", "Sign in")}
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("دخول", "Sign in")}</span>
                </Link>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="relative min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-white/80"
              style={{ color: "var(--sf-header-fg)" }}
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  (window as any).ReactNativeWebView?.postMessage
                ) {
                  (window as any).ReactNativeWebView.postMessage(
                    JSON.stringify({ type: "OPEN_NOTIFICATIONS" }),
                  );
                } else {
                  setNotificationsOpen(true);
                }
              }}
              aria-label={t("الإشعارات", "Notifications")}
            >
              <Bell className="h-5 w-5" />
              <span className="hidden sm:inline">{t("الإشعارات", "Notifications")}</span>
            </Button>

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="relative min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-white/80"
              style={{ color: "var(--sf-header-fg)" }}
            >
              <Link
                to="/$slug/wishlist"
                params={{ slug: brand.slug }}
                aria-label={t("المفضلة", "Wishlist")}
              >
                <Heart className="h-5 w-5" />
                <span className="hidden sm:inline">{t("المفضلة", "Wishlist")}</span>
                {wishlistCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-xs font-semibold"
                    style={{
                      backgroundColor: "var(--sf-btn-primary-bg)",
                      color: "var(--sf-btn-primary-fg)",
                    }}
                  >
                    {wishlistCount}
                  </span>
                )}
              </Link>
            </Button>

            <CartDrawer>
              <Button
                variant="ghost"
                size="sm"
                className="relative min-h-11 min-w-11 gap-1 bg-transparent hover:bg-white/10 active:bg-white/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-white/80"
                style={{ color: "var(--sf-header-fg)" }}
                aria-label={t("سلة التسوق", "Shopping cart")}
              >
                <ShoppingBag className="h-5 w-5" />
                <span className="hidden sm:inline">{t("السلة", "Cart")}</span>
                {cartCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-xs font-semibold grid place-items-center"
                    style={{
                      backgroundColor: "var(--sf-btn-primary-bg)",
                      color: "var(--sf-btn-primary-fg)",
                    }}
                  >
                    {cartCount}
                  </span>
                )}
              </Button>
            </CartDrawer>
          </div>
        </div>

        {/* Mobile: keep Menu beside Search in the sticky header. */}
        <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex items-center gap-2 pb-1 md:hidden">
          <div className="shrink-0">
            <MobileStorefrontDropdown />
          </div>
          <div className="min-w-0 flex-1">
            <SearchBar />
          </div>
        </div>
      </div>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {t("إشعارات المتجر", "Store Notifications")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(
                "استقبل تنبيهات مباشرة وفورية عند توفر عروض جديدة وتحديثات طلباتك.",
                "Receive direct instant notifications about new promotions and your order status.",
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setNotificationsOpen(false)}>
                {t("إغلاق", "Close")}
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (typeof window !== "undefined" && "Notification" in window) {
                    try {
                      await Notification.requestPermission();
                    } catch {}
                  }
                  setNotificationsOpen(false);
                }}
              >
                {t("تفعيل الإشعارات", "Enable Notifications")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
          className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md hover:bg-white/15 opacity-80 hover:opacity-100"
          aria-label="Dismiss announcement"
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
