import { Outlet, useRouter } from "@tanstack/react-router";
import React, { useEffect } from "react";
import { useStorefront } from "@/lib/storefront-context";
import { useQueryClient } from "@tanstack/react-query";
import { StorefrontAnalytics } from "@/components/storefront-analytics";
import { isCatalogMode } from "@/lib/storefront-mode";
import { AnnouncementBar, StoreHeader } from "@/components/storefront/StorefrontHeader";
import { DesktopStoreNavigation } from "@/components/storefront/StorefrontNavigation";
import { WhatsAppFab } from "@/features/storefront-shell/components/WhatsAppFab";
import { StorefrontFooter } from "@/features/storefront-shell/components/StorefrontFooter";
import { shellTheme } from "@/features/storefront-shell/lib/shell-theme";

/** The storefront frame: theme variables, typography, the sticky header, the page, the footer, WhatsApp and the analytics consent. */
export function StoreShell() {
  const { brand, settings, lang, cart, clearCart } = useStorefront();
  useQueryClient();
  useRouter();

  const isCatalog = isCatalogMode(settings);
  useEffect(() => {
    if (isCatalog && cart.length > 0) {
      clearCart();
    }
  }, [isCatalog, cart.length, clearCart]);

  const { style, isGlass, typographyFaces } = shellTheme({ brand, settings, lang });

  useEffect(() => {
    // Clean up refresh tokens stored by the retired client-only pseudo-passkey flow.
    localStorage.removeItem(`passkey_token_${brand.slug}`);
    localStorage.removeItem(`passkey_registered_${brand.slug}`);

    // Detect if embedded in an iframe or preview mode to suppress OS scrollbars
    const isEmbedded =
      typeof window !== "undefined" &&
      (window.self !== window.top || window.location.search.includes("preview=1"));
    if (isEmbedded) {
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

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="storefront-shell min-h-screen flex flex-col w-full max-w-full overflow-x-hidden"
      style={style}
    >
      {/* Note: `html.lang-ar body` in styles.css pins the admin Arabic stack
          (Readex Pro first) and outspecifies anything set here. It is harmless
          only because <body> owns no text directly — every storefront string
          lives inside this shell, which sets the brand's own font. Any text
          rendered outside this element re-triggers a ~118 KB face download,
          which is exactly what the consent banner used to do. Keep storefront
          UI inside the shell. */}
      {typographyFaces && <style>{typographyFaces}</style>}
      <div
        className={`sticky top-0 z-40 ${isGlass ? "backdrop-blur-md" : ""}`}
        style={{
          backgroundColor: "var(--sf-header-bg)",
          color: "var(--sf-header-fg)",
          // Inset hairline instead of a border: it adds no layout height, so a
          // full-bleed hero can sit flush under the header without a seam.
          boxShadow: "inset 0 -1px 0 rgba(0, 0, 0, 0.08)",
          transform: "translateZ(0)",
        }}
      >
        <AnnouncementBar />
        <StoreHeader />
        <DesktopStoreNavigation />
      </div>
      <main className="flex-1">
        <Outlet />
      </main>
      <StorefrontFooter />
      <WhatsAppFab />
      {/* Inside the shell on purpose: the consent banner used to render outside
          this element and inherited the admin font stack, which pulled ~229 KB
          of fonts (Readex Pro + Zarid Display) that nothing else on the
          storefront uses. */}
      <StorefrontAnalytics />
    </div>
  );
}
