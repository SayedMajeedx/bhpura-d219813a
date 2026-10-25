import { useState } from "react";
import { arNoun } from "@/lib/arabic-count";
import { Link } from "@tanstack/react-router";
import { Clock, KeyRound, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { optionName, type ServiceOption } from "@/lib/bookings/service-options";
import type { ProductRow } from "@/lib/data/storefront";
import { ServiceDetailsDialog } from "@/features/services-home/components/ServiceDetailsDialog";
import {
  extraHourPriceOf,
  lengthPrices,
  minutesText,
  servicePlace,
} from "@/features/services-home/lib/services-home";

/** How many hourly prices show on the card before "and N more". */
const SHOWN_LENGTHS = 4;

/**
 * A rental: something hired by the hour. A ticket-style card (a bold top edge,
 * a perforated divider) that lists what each length costs, so it never reads as
 * a plain service or as a package. What is hired sells itself, so its picture
 * runs the card's full width; the mark says "rental" for any kind of store.
 */
export function RentalCard({
  product,
  addOns,
}: {
  product: ProductRow;
  addOns: readonly ServiceOption[];
}) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  const name = (isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "";
  const lengths = lengthPrices(product);
  const place = servicePlace(product.service_location, isAr);
  const extra = extraHourPriceOf(product);
  const optional = addOns.filter((o) => o.mode === "optional" || o.mode === "default_on");
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <article className="rental-card flex flex-col">
      {product.image_url && (
        <img
          src={product.image_url}
          alt={name}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
        />
      )}
      <div className="space-y-1 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
          <KeyRound className="size-3.5" aria-hidden="true" />
          {t("تأجير", "Rental")}
        </p>
        <h3 className="font-display text-lg leading-tight text-foreground">{name}</h3>
        {place && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden="true" />
            {place}
          </p>
        )}
      </div>
      <div className="rental-card__tear" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        {lengths.length > 0 && (
          <ul className="grid grid-cols-2 gap-2" aria-label={t("المدة والسعر", "Length and price")}>
            {lengths.slice(0, SHOWN_LENGTHS).map((length) => (
              <li
                key={length.minutes}
                className="rounded-lg border border-border bg-background/70 px-3 py-2 text-center"
              >
                <span className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" aria-hidden="true" />
                  {minutesText(length.minutes, isAr)}
                </span>
                <span
                  className="block font-display text-base font-semibold text-foreground"
                  dir="ltr"
                >
                  {formatPrice(length.price, currency, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {lengths.length > SHOWN_LENGTHS && (
          <p className="text-xs text-muted-foreground">
            {t(
              `+ ${arNoun(lengths.length - SHOWN_LENGTHS, "length")}`,
              `and ${lengths.length - SHOWN_LENGTHS} more lengths`,
            )}
          </p>
        )}
        {optional.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Plus className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t("إضافات: ", "Add-ons: ")}
              {optional.map((option) => optionName(option, isAr)).join(isAr ? "، " : ", ")}
            </span>
          </p>
        )}
        {extra !== null && (
          <p className="text-xs text-muted-foreground">
            {t("ساعة إضافية بسعر ", "Extra hour at ")}
            <span dir="ltr">{formatPrice(extra, currency, lang)}</span>
          </p>
        )}
        <div className="mt-auto grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={() => setDetailsOpen(true)}>
            {t("عرض التفاصيل", "View details")}
          </Button>
          <Button asChild>
            <Link to="/$slug/book" params={{ slug: brand.slug }} search={{ service: product.id }}>
              {t("احجز الآن", "Book now")}
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
