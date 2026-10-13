import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatPrice, type CartItem, type StoreLang } from "@/lib/storefront-context";
import { displayVariantParts } from "@/lib/variant-sku-utils";
import { ResponsiveImage } from "@/components/responsive-media";
import { Button } from "@/components/ui/button";
import type { Storefront } from "@/features/checkout/types";

/** "قطعة واحدة", "قطعتان", "3 قطع", "11 قطعة": the count as Arabic says it. */
function piecesAr(n: number): string {
  if (n === 1) return "قطعة واحدة";
  if (n === 2) return "قطعتان";
  return n <= 10 ? `${n} قطع` : `${n} قطعة`;
}

/**
 * What the shopper is buying, at the top of checkout on a phone. The full
 * summary sits beside the form on a wide screen but falls to the foot of a
 * phone's single column, four screens down, so a shopper filled in name,
 * address and payment before seeing their order. Closed it shows the pieces'
 * photos, how many and the total; a tap lists each piece.
 */
export function MobileCartPeek({
  cart,
  grandTotal,
  currency,
  lang,
  t,
}: {
  cart: CartItem[];
  grandTotal: number;
  currency: string;
  lang: StoreLang;
  t: Storefront["t"];
}) {
  const [open, setOpen] = useState(false);
  if (cart.length === 0) return null;
  const pieces = cart.reduce((sum, item) => sum + item.qty, 0);
  const shown = cart.slice(0, 4);

  return (
    <section className="md:hidden rounded-xl border border-border bg-card">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls="checkout-cart-peek"
        onClick={() => setOpen((value) => !value)}
        className="h-auto w-full min-w-0 justify-start gap-3 rounded-xl p-3 text-start font-normal hover:bg-muted/40"
      >
        <span className="flex shrink-0 -space-x-2 rtl:space-x-reverse">
          {shown.map((item) => (
            <span
              key={item.cart_line_id}
              className="h-10 w-10 overflow-hidden rounded-lg border-2 border-card bg-muted"
            >
              {item.image ? (
                <ResponsiveImage
                  src={item.image}
                  alt=""
                  preset="thumb"
                  sizes="40px"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("طلبك", "Your order")}</span>
          <span className="block text-xs text-muted-foreground">
            {t(piecesAr(pieces), `${pieces} ${pieces === 1 ? "item" : "items"}`)}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold">
          {formatPrice(grandTotal, currency, lang)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </Button>
      {open && (
        <ul id="checkout-cart-peek" className="space-y-2 border-t border-border p-3">
          {cart.map((item) => {
            const parts = displayVariantParts(
              {
                size: item.size,
                size_unit: item.size_unit,
                color: item.color,
                fabric: item.fabric,
              },
              lang,
            );
            return (
              <li
                key={item.cart_line_id}
                className="flex min-w-0 items-start justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block line-clamp-2 break-words">
                    {item.name} × {item.qty}
                  </span>
                  {parts.length > 0 && (
                    <span className="block break-words text-xs text-muted-foreground">
                      {parts.join(" · ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0">
                  {formatPrice(item.price * item.qty, currency, lang)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
