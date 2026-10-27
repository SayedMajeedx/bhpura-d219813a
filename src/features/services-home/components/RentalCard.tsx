import { useState } from "react";
import { arNoun } from "@/lib/arabic-count";
import { Link } from "@tanstack/react-router";
import { Check, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { PRODUCT_PHOTO_CLASS } from "@/lib/brand-templates/design-presets";
import { serviceLengthsText } from "@/lib/bookings/service-lengths";
import {
  defaultAddOnNames,
  priceWithDefaults,
  type ServiceOption,
} from "@/lib/bookings/service-options";
import type { ProductRow } from "@/lib/data/storefront";
import { ServiceDetailsDialog } from "@/features/services-home/components/ServiceDetailsDialog";
import { AddOnList } from "@/features/services-home/components/AddOnList";
import {
  extraHourPriceOf,
  includeLinesOf,
  lengthPrices,
  minutesText,
  servicePlace,
} from "@/features/services-home/lib/services-home";
import {
  addOnLines,
  descriptionLead,
  rentalPhotoRatio,
} from "@/features/services-home/lib/rental-card";
import { useLiveOffers } from "@/hooks/use-live-offers";
import { offeredCardPrice, offeredShownPrice } from "@/lib/offer-price";
import { OfferTag } from "@/components/storefront/OfferTag";

/** How many of "what's included" show on the card before "+ N". */
const SHOWN_INCLUDES = 4;

/**
 * A rental: something hired by the hour, shown as a wide card. Its photo stands whole in its own
 * shape on one side (on a phone, above), and beside it what a customer needs to choose: what it
 * is, where, what comes with it, a length with its one price, the add-ons with theirs, and a
 * booking that carries the length chosen. The rows of a section alternate sides on a wide screen.
 */
export function RentalCard({
  product,
  addOns,
  flip = false,
}: {
  product: ProductRow;
  addOns: readonly ServiceOption[];
  /** Photo on the end side (every other row on a wide screen). */
  flip?: boolean;
}) {
  const { brand, lang, currency, settings, t } = useStorefront();
  const isAr = lang === "ar";
  const name = (isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "";
  const lengths = lengthPrices(product);
  const place = servicePlace(product.service_location, isAr);
  const lengthsText = serviceLengthsText(product.product_variants, isAr);
  const lead = descriptionLead(product, isAr);
  const includes = includeLinesOf(product, isAr);
  const extras = addOnLines(addOns, isAr);
  const extraHour = extraHourPriceOf(product);
  const defaultNames = defaultAddOnNames(addOns, isAr);
  const ratio = rentalPhotoRatio(settings);
  const [minutes, setMinutes] = useState<number | null>(lengths[0]?.minutes ?? null);
  const chosen = lengths.find((length) => length.minutes === minutes) ?? lengths[0] ?? null;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const money = (amount: number) => formatPrice(amount, currency, lang);
  // The store's offers on the chosen length's price and the card's badge (src/lib/offer-price.ts).
  const offers = useLiveOffers();
  const badge = offeredCardPrice(product, product.product_variants, offers).offerBadge;
  const listed = chosen
    ? priceWithDefaults(chosen.price, addOns, chosen.minutes, lengths[0]?.minutes)
    : 0;
  const offered = offeredShownPrice(offers, product, {
    price: listed,
    was: 0,
    min: listed,
    max: listed,
    isRange: false,
  });

  return (
    <article
      className={cn(
        "rental-card grid",
        product.image_url && "sm:grid-cols-[minmax(0,clamp(14rem,38%,24rem))_minmax(0,1fr)]",
        product.image_url &&
          flip &&
          "lg:grid-cols-[minmax(0,1fr)_minmax(0,clamp(14rem,38%,24rem))]",
      )}
    >
      {product.image_url && (
        <div className={cn("relative overflow-hidden bg-muted", flip && "lg:order-last")}>
          {/* Holds the photo's shape; the row grows past it when the words need more room. */}
          <div className={PRODUCT_PHOTO_CLASS[ratio]} aria-hidden="true" />
          {/* When the row is taller than the photo, the photo stays whole over a soft copy of
              itself: covered, the narrow column of a tablet cut a booth's sides away. */}
          <img
            src={product.image_url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl"
          />
          <img
            src={product.image_url}
            alt={name}
            loading="lazy"
            className="absolute inset-0 size-full object-contain"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <header className="space-y-2">
          <h3 className="font-display text-xl leading-tight text-balance text-foreground sm:text-2xl">
            {name}
            <OfferTag badge={badge} className="ms-2 align-middle" />
          </h3>
          {(place || lengthsText) && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {place && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4" aria-hidden="true" />
                  {place}
                </span>
              )}
              {lengthsText && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-4" aria-hidden="true" />
                  {lengthsText}
                </span>
              )}
            </p>
          )}
          {lead && (
            <p className="line-clamp-3 max-w-prose text-sm leading-relaxed text-foreground/80">
              {lead}
            </p>
          )}
        </header>

        {includes.length > 0 && (
          <ul className="grid gap-x-4 gap-y-1.5 text-sm text-foreground sm:grid-cols-2">
            {includes.slice(0, SHOWN_INCLUDES).map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 break-words">{line}</span>
              </li>
            ))}
            {includes.length > SHOWN_INCLUDES && (
              <li className="text-xs text-muted-foreground sm:col-span-2">
                {t(
                  `+ ${arNoun(includes.length - SHOWN_INCLUDES, "line")}`,
                  `+ ${includes.length - SHOWN_INCLUDES} more`,
                )}
              </li>
            )}
          </ul>
        )}

        <div className="rental-card__tear !mx-0" aria-hidden="true" />

        {chosen && (
          <div className="space-y-3">
            {lengths.length > 1 && (
              <div
                role="radiogroup"
                aria-label={t("المدة", "Length")}
                className="flex flex-wrap gap-1.5"
              >
                {lengths.map((length) => {
                  const active = length.minutes === chosen.minutes;
                  return (
                    <button
                      key={length.minutes}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setMinutes(length.minutes)}
                      className={cn(
                        "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-primary/50",
                      )}
                    >
                      {minutesText(length.minutes, isAr)}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="flex flex-wrap items-baseline gap-x-2" aria-live="polite">
              <span className="font-display text-3xl font-semibold text-foreground">
                {money(offered ? offered.price : listed)}
              </span>
              {offered && <s className="text-sm text-muted-foreground">{money(offered.was)}</s>}
              <span className="text-sm text-muted-foreground">
                {t(
                  `لمدة ${minutesText(chosen.minutes, true)}`,
                  `for ${minutesText(chosen.minutes, false)}`,
                )}
              </span>
            </p>
            {defaultNames.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t(
                  `يشمل ${defaultNames.join("، ")} (يمكن إزالتها عند الحجز)`,
                  `Includes ${defaultNames.join(", ")} (you can remove it when booking)`,
                )}
              </p>
            )}
            {extraHour !== null && (
              <p className="text-xs text-muted-foreground">
                {t("كل ساعة إضافية ", "Each extra hour ")}
                <span>{money(extraHour)}</span>
              </p>
            )}
          </div>
        )}

        <AddOnList lines={extras} />

        <div className="mt-auto grid gap-2 pt-1 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={() => setDetailsOpen(true)}>
            {t("عرض التفاصيل", "View details")}
          </Button>
          <Button asChild>
            <Link
              to="/$slug/book"
              params={{ slug: brand.slug }}
              search={{ service: product.id, ...(chosen ? { minutes: chosen.minutes } : {}) }}
            >
              {chosen && lengths.length > 1
                ? t(
                    `احجز ${minutesText(chosen.minutes, true)}`,
                    `Book ${minutesText(chosen.minutes, false)}`,
                  )
                : t("احجز الآن", "Book now")}
            </Link>
          </Button>
        </div>
      </div>
      {detailsOpen && (
        <ServiceDetailsDialog
          product={product}
          addOns={addOns}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      )}
    </article>
  );
}
