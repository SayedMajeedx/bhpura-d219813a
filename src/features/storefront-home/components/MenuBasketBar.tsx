import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { claimBottomBar, releaseBottomBar } from "@/lib/bottom-bar-store";
import { arCount } from "@/lib/arabic-count";

const CLAIM = "menu-basket";

/**
 * The basket within reach on a menu: once something is in it, a bar at the foot of the screen
 * says how many pieces and what they come to, and goes to checkout. It holds the bottom slot
 * while it shows (`claimBottomBar`), so the floating WhatsApp button rises above it.
 */
export function MenuBasketBar() {
  const { brand, cartCount, cartTotal, currency, lang, t } = useStorefront();
  const shows = cartCount > 0;

  useEffect(() => {
    if (!shows) return;
    claimBottomBar(CLAIM);
    return () => releaseBottomBar(CLAIM);
  }, [shows]);

  if (!shows) return null;
  const pieces =
    lang === "ar"
      ? arCount(cartCount, { one: "قطعة واحدة", two: "قطعتان", few: "قطع", many: "قطعة" })
      : cartCount === 1
        ? "1 item"
        : `${cartCount} items`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <Link
        to="/$slug/checkout"
        params={{ slug: brand.slug }}
        className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between gap-3 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg transition-transform active:scale-[0.98]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag className="size-5" aria-hidden="true" />
          {pieces}
          <span className="opacity-80" dir="ltr">
            · {formatPrice(cartTotal, currency, lang)}
          </span>
        </span>
        <span className="text-sm font-bold">{t("إتمام الطلب", "Checkout")}</span>
      </Link>
    </div>
  );
}
