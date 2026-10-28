import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { storefrontQueries } from "@/lib/data/storefront";
import { bookingDiscountsQueries } from "@/lib/data/booking-discounts";
import { bookingsQueries } from "@/lib/data/bookings";
import { todayIn } from "@/lib/bookings/rules";
import { offerLine, offersToShow } from "@/lib/bookings/discounts";

/**
 * The store's booking offers as lines a shopper reads before choosing a date ("خصم 25% على
 * فوتوبوث · خلال أسبوع", naming the services it is for and needs): on a service's page those
 * that reach the service, on the services home every one. The database applies them when the
 * booking is made; nothing here prices anything.
 */
export function BookingOffersList({
  productId = null,
  className,
}: {
  /** The service whose offers to list; null lists every offer. */
  productId?: string | null;
  className?: string;
}) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  const rules = useQuery(bookingDiscountsQueries.public(brand.id)).data ?? [];
  const timezone = useQuery(bookingsQueries.publicRules(brand.id)).data?.timezone ?? "Asia/Bahrain";
  const offers = offersToShow(rules, todayIn(timezone), productId);
  // The services an offer is for and the ones it needs, by name (the store's catalog, which the
  // page has already read), and an amount in the store's money.
  const products = useQuery({
    ...storefrontQueries.products(brand),
    enabled: offers.some((rule) => rule.product_ids?.length || rule.requires_product_ids?.length),
  }).data;
  const words = {
    name: (id: string) => {
      const product = products?.find((item) => item.id === id);
      return product
        ? isAr
          ? product.name_ar || product.name
          : product.name_en || product.name
        : null;
    },
    money: (amount: number) => formatPrice(amount, currency, lang),
  };
  if (offers.length === 0) return null;
  return (
    <section className={className} aria-label={t("العروض", "Offers")}>
      <ul className="space-y-1.5">
        {offers.map((rule) => (
          <li
            key={rule.id}
            className="flex items-start gap-2 rounded-lg bg-success-subtle px-3 py-2 text-sm text-foreground"
          >
            <Tag className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span className="min-w-0 break-words">{offerLine(rule, isAr, words)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
