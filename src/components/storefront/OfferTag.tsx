import { useStorefront } from "@/lib/storefront-context";
import type { OfferBadge } from "@/lib/offer-price";
import { cn } from "@/lib/utils";
import { SALE_BADGE_CLASS } from "@/lib/storefront-badges";

/**
 * The store's offer on a service, a package, a rental or a menu row (src/lib/offer-price.ts):
 * "−26%" when the offer lowers its price, "Offer" when the offer has terms. The product cards draw
 * theirs in their own badge place.
 */
export function OfferTag({ badge, className }: { badge: OfferBadge | null; className?: string }) {
  const { t } = useStorefront();
  if (!badge) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        SALE_BADGE_CLASS,
        className,
      )}
    >
      {badge.kind === "discount" ? `-${badge.percent}%` : t("عرض", "Offer")}
    </span>
  );
}
