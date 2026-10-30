import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { offersQueries } from "@/lib/data/offers";
import { freeDeliveryNudge, nudgeSentence } from "@/lib/offers";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { isCatalogMode } from "@/lib/storefront-mode";

/**
 * In the cart: how far the cart is from the store's free-delivery offer ("Add 4.000 BHD more for
 * free local delivery"), with a bar, or that it already has it. Nothing when the store has no
 * such offer; checkout applies it.
 */
export function FreeDeliveryNudge() {
  const { brand, settings, cart, lang, currency } = useStorefront();
  const sells = !isCatalogMode(settings);
  const offers = useQuery(offersQueries.live(brand.slug, sells)).data ?? [];
  const nudge = sells ? freeDeliveryNudge(offers, cart) : null;
  if (!nudge) return null;
  const money = (n: number) => formatPrice(n, currency, lang);
  const goal = nudge.offer.min_subtotal ?? 0;
  const progress =
    nudge.state === "unlocked" || goal <= 0
      ? 100
      : Math.max(0, 100 - (nudge.remaining / goal) * 100);

  return (
    <div className="space-y-1.5 rounded-lg border border-border px-3 py-2" role="status">
      <p className="flex items-start gap-2 text-sm">
        <Truck
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: settings.primary_color }}
          aria-hidden
        />
        <span className="min-w-0">{nudgeSentence(nudge, lang, money)}</span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          // The fill grows from the reading start on the compositor (scale, not width).
          className="h-full w-full rounded-full transition-transform duration-(--motion-slow) ease-(--motion-ease-smooth) ltr:origin-left rtl:origin-right"
          style={{
            transform: `scaleX(${Math.min(Math.max(progress, 0), 100) / 100})`,
            backgroundColor: settings.primary_color,
          }}
        />
      </div>
    </div>
  );
}
