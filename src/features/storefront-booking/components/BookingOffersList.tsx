import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { bookingDiscountsQueries } from "@/lib/data/booking-discounts";
import { bookingsQueries } from "@/lib/data/bookings";
import { todayIn } from "@/lib/bookings/rules";
import { offerLine, offersToShow } from "@/lib/bookings/discounts";

/**
 * The store's booking offers as lines a shopper reads before choosing a date ("خصم 25% · خلال 14
 * يوماً"): on a service's page those that reach the service, on the services home every one. The
 * database applies them when the booking is made; nothing here prices anything.
 */
export function BookingOffersList({
  productId = null,
  className,
}: {
  /** The service whose offers to list; null lists every offer. */
  productId?: string | null;
  className?: string;
}) {
  const { brand, lang, t } = useStorefront();
  const isAr = lang === "ar";
  const rules = useQuery(bookingDiscountsQueries.public(brand.id)).data ?? [];
  const timezone = useQuery(bookingsQueries.publicRules(brand.id)).data?.timezone ?? "Asia/Bahrain";
  const offers = offersToShow(rules, todayIn(timezone), productId);
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
            <span className="min-w-0 break-words">{offerLine(rule, isAr)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
