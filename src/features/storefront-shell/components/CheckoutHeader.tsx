import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { cloudflareImageUrl } from "@/lib/media-delivery";

/**
 * The header on checkout: the store's logo and one way back, nothing else. The full header (the
 * announcement, the menu, search, the wishlist and the cart) stayed on checkout, and each was a
 * way to leave in the middle of paying; the footer and the floating WhatsApp button already left.
 */
export function CheckoutHeader() {
  const { brand, settings, lang, t } = useStorefront();
  const displayName = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en;
  const logoSize = Math.min(settings.logo_size || 40, 48);
  const Back = lang === "ar" ? ChevronRight : ChevronLeft;
  return (
    <header className="w-full">
      <div className="mx-auto grid min-h-14 max-w-4xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 py-1 sm:px-6">
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-medium opacity-80 hover:opacity-100"
        >
          <Back className="size-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{t("متابعة التسوق", "Continue shopping")}</span>
          <span className="sm:hidden">{t("المتجر", "Store")}</span>
        </Link>
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="flex min-h-11 items-center justify-center"
          aria-label={displayName}
        >
          {settings.logo_url ? (
            <img
              src={cloudflareImageUrl(settings.logo_url, 240)}
              alt={displayName}
              decoding="async"
              className="object-contain"
              style={{ height: logoSize, width: "auto", maxWidth: logoSize * 3 }}
            />
          ) : (
            <span className="font-display text-base font-semibold">{displayName}</span>
          )}
        </Link>
        <span aria-hidden="true" />
      </div>
    </header>
  );
}
