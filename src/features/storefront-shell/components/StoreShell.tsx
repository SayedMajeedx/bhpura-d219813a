import { Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { useAutoHideHeader } from "@/features/storefront-shell/hooks/use-auto-hide-header";
import { StoreStatusBanner } from "@/features/storefront-shell/components/StoreStatusBanner";
import React, { useEffect, useRef, useState } from "react";
import { useStorefront } from "@/lib/storefront-context";
import { useQueryClient } from "@tanstack/react-query";
import { StorefrontAnalytics } from "@/components/storefront-analytics";
import { isCatalogMode } from "@/lib/storefront-mode";
import { AnnouncementBar, StoreHeader } from "@/components/storefront/StorefrontHeader";
import { DesktopStoreNavigation } from "@/components/storefront/StorefrontNavigation";
import { WhatsAppFab } from "@/features/storefront-shell/components/WhatsAppFab";
import { StorefrontFooter } from "@/features/storefront-shell/components/StorefrontFooter";
import { isCheckoutPath } from "@/features/storefront-shell/lib/checkout-path";
import { CheckoutHeader } from "@/features/storefront-shell/components/CheckoutHeader";
import { shellTheme } from "@/features/storefront-shell/lib/shell-theme";
import { isEmbeddedWindow } from "@/features/storefront-shell/lib/embedded";

/** The storefront frame: theme variables, typography, the sticky header, the page, the footer, WhatsApp and the analytics consent. */
export function StoreShell() {
  const { brand, settings, lang, cart, clearCart } = useStorefront();
  const isCheckout = isCheckoutPath(useLocation().pathname);
  useQueryClient();
  useRouter();

  const isCatalog = isCatalogMode(settings);
  useEffect(() => {
    if (isCatalog && cart.length > 0) {
      clearCart();
    }
  }, [isCatalog, cart.length, clearCart]);

  const { style, isGlass, typographyFaces } = shellTheme({ brand, settings, lang });

  // The sticky header's height, for what sticks under it (a menu's category tabs) and what a tab
  // scrolls to (`--sf-header-h`). It changes with the announcement bar and the screen's width.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight));
    observer.observe(header);
    setHeaderHeight(header.offsetHeight);
    return () => observer.disconnect();
  }, []);
  // Out of view on a scroll down, back for a moment on a scroll up, always at the top of the page.
  const headerHidden = useAutoHideHeader(headerRef);

  useEffect(() => {
    // Clean up refresh tokens stored by the retired client-only pseudo-passkey flow.
    localStorage.removeItem(`passkey_token_${brand.slug}`);
    localStorage.removeItem(`passkey_registered_${brand.slug}`);

    // Detect if embedded in an iframe or preview mode to suppress OS scrollbars
    if (isEmbeddedWindow(window)) {
      document.documentElement.classList.add("is-embedded", "scrollbar-none");
      document.body.classList.add("is-embedded", "scrollbar-none");
    }
    return () => {
      document.documentElement.classList.remove("is-embedded", "scrollbar-none");
      document.body.classList.remove("is-embedded", "scrollbar-none");
    };
  }, [brand.slug]);

  // Theme values come from the database only. Legacy preview overrides that the old
  // settings page stored in localStorage are purged so a stale key can never shadow
  // what the merchant actually saved.
  useEffect(() => {
    try {
      localStorage.removeItem("boutq_storefront_radius");
      localStorage.removeItem("boutq_header_glass");
      localStorage.removeItem("boutq_badge_accent");
    } catch (_e) {
      // localStorage unavailable (private mode) — nothing to purge.
    }
  }, []);

  // Sideways overflow is clipped by `.storefront-shell` (styles.css), never hidden here: a hiding
  // shell is a scroll box of its own, and the sticky header and gallery scrolled away with it.
  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="storefront-shell min-h-screen flex flex-col w-full max-w-full"
      style={
        {
          ...style,
          "--sf-header-h": `${headerHeight}px`,
          // What sticks under the header (the gallery, a menu's tabs) sits under what is shown of it.
          "--sf-header-offset": headerHidden ? "0px" : `${headerHeight}px`,
        } as React.CSSProperties
      }
    >
      {/* Note: `html.lang-ar body` in styles.css pins the admin Arabic stack
          (Readex Pro first) and outspecifies anything set here. It is harmless
          only because <body> owns no text directly — every storefront string
          lives inside this shell, which sets the brand's own font. Any text
          rendered outside this element re-triggers a ~118 KB face download,
          which is exactly what the consent banner used to do. Keep storefront
          UI inside the shell. */}
      {typographyFaces && <style>{typographyFaces}</style>}
      {/* The first stop of a keyboard: past the header's links, straight to the page. */}
      <a
        href="#store-main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg"
      >
        {lang === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}
      </a>
      <div
        ref={headerRef}
        // Its colour runs under the status bar of a store added to the home screen (the page
        // is `viewport-fit=cover`); its content starts below it. Zero in a browser tab.
        className={`sticky top-0 z-40 pt-[env(safe-area-inset-top,0px)] transition-transform duration-(--motion-medium) ease-(--motion-ease-smooth) ${isGlass ? "backdrop-blur-md" : ""}`}
        data-hidden={headerHidden ? "true" : undefined}
        style={{
          backgroundColor: "var(--sf-header-bg)",
          color: "var(--sf-header-fg)",
          // Inset hairline instead of a border: it adds no layout height, so a
          // full-bleed hero can sit flush under the header without a seam.
          boxShadow: "inset 0 -1px 0 rgba(0, 0, 0, 0.08)",
          transform: headerHidden ? "translate3d(0, -100%, 0)" : "translateZ(0)",
        }}
      >
        {/* Checkout keeps the logo and a way back; whether the store takes orders now stays. */}
        {!isCheckout && <AnnouncementBar />}
        <StoreStatusBanner />
        {isCheckout ? (
          <CheckoutHeader />
        ) : (
          <>
            <StoreHeader />
            <DesktopStoreNavigation />
          </>
        )}
      </div>
      <main id="store-main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      {/* Checkout keeps the shopper on the form: no footer to wander off through. */}
      {!isCheckout && <StorefrontFooter />}
      <WhatsAppFab />
      {/* Inside the shell on purpose: the consent banner used to render outside
          this element and inherited the admin font stack, which pulled ~229 KB
          of fonts (Readex Pro + Zarid Display) that nothing else on the
          storefront uses. */}
      <StorefrontAnalytics />
    </div>
  );
}
