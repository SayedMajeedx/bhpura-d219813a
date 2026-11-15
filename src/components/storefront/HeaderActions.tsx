import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, Search, ShoppingBag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/motion/CountBadge";
import { CurrencySwitcher } from "@/components/storefront/CurrencySwitcher";
import { CartDrawer } from "@/components/storefront/StorefrontCartDrawer";
import { useStorefront } from "@/lib/storefront-context";
import { isCatalogMode } from "@/lib/storefront-mode";

/**
 * A header icon: 44px, the bar's own colour, named for screen readers (the header review of
 * 2026-11-15: a word beside every icon made six buttons of one weight).
 */
export const HEADER_ICON =
  "relative h-11 w-11 rounded-full bg-transparent hover:bg-current/10 active:bg-current/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-current/80";

const COUNT_BADGE =
  "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-xs font-semibold";
const COUNT_COLOURS = {
  backgroundColor: "var(--sf-btn-primary-bg)",
  color: "var(--sf-btn-primary-fg)",
};

/** Account, wishlist and bag; search first when the row has room for it. */
export function HeaderShoppingIcons({ onSearch }: { onSearch?: () => void }) {
  const { brand, settings, t, cartCount, session, isStoreMember, wishlistCount } = useStorefront();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = Boolean(session && isStoreMember);
  const accountLabel = signedIn ? t("حسابي", "My account") : t("تسجيل الدخول", "Sign in");

  return (
    <div className="flex items-center gap-0.5" style={{ color: "var(--sf-header-fg)" }}>
      {onSearch && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={HEADER_ICON}
          onClick={onSearch}
          aria-label={t("البحث", "Search")}
          title={t("البحث", "Search")}
        >
          <Search className="h-5 w-5" strokeWidth={1.75} />
        </Button>
      )}

      <Button asChild variant="ghost" size="icon" className={HEADER_ICON}>
        {signedIn ? (
          <Link
            to="/$slug/account"
            params={{ slug: brand.slug }}
            aria-label={accountLabel}
            title={accountLabel}
          >
            <User className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        ) : (
          <Link
            to="/$slug/auth"
            params={{ slug: brand.slug }}
            search={{
              redirect: mounted ? window.location.pathname + window.location.search : "",
            }}
            aria-label={accountLabel}
            title={accountLabel}
          >
            <User className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        )}
      </Button>

      <Button asChild variant="ghost" size="icon" className={HEADER_ICON}>
        <Link
          to="/$slug/wishlist"
          params={{ slug: brand.slug }}
          aria-label={t("المفضلة", "Wishlist")}
          title={t("المفضلة", "Wishlist")}
        >
          <Heart className="h-5 w-5" strokeWidth={1.75} />
          <CountBadge
            count={wishlistCount}
            placement="absolute top-1 end-1"
            className={COUNT_BADGE}
            style={COUNT_COLOURS}
          />
        </Link>
      </Button>

      {!isCatalogMode(settings) && (
        <CartDrawer>
          <Button
            variant="ghost"
            size="icon"
            className={HEADER_ICON}
            aria-label={t("سلة التسوق", "Shopping cart")}
            title={t("السلة", "Cart")}
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
            <CountBadge
              count={cartCount}
              placement="absolute top-1 end-1"
              className={COUNT_BADGE}
              style={COUNT_COLOURS}
            />
          </Button>
        </CartDrawer>
      )}
    </div>
  );
}

/**
 * The language and the currency, small and quiet after the shopping icons: a shopper sets them
 * once. The other language is written in itself ("English" on an Arabic page).
 */
export function HeaderStoreSettings() {
  const { lang, setLang } = useStorefront();
  const other = lang === "ar" ? "en" : "ar";
  return (
    <div className="flex items-center gap-1 text-xs" style={{ color: "var(--sf-header-fg)" }}>
      <span aria-hidden className="mx-1 h-5 w-px bg-current opacity-20" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 px-2 text-xs font-medium bg-transparent hover:bg-current/10 active:bg-current/20 text-inherit border-0 shadow-none focus-visible:ring-2 focus-visible:ring-current/80"
        onClick={() => setLang(other)}
        aria-label={lang === "ar" ? "تغيير اللغة إلى الإنجليزية" : "Switch language to Arabic"}
      >
        <span lang={other}>{other === "en" ? "English" : "العربية"}</span>
      </Button>
      <CurrencySwitcher />
    </div>
  );
}
