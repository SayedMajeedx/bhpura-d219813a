import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Clock, Gem, MapPin, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { packageCardClass, type PackageStyle } from "@/lib/bookings/package-style";
import { optionName, type ServiceOption } from "@/lib/bookings/service-options";
import type { ProductRow } from "@/lib/data/storefront";
import { ServiceDetailsDialog } from "@/features/services-home/components/ServiceDetailsDialog";
import {
  extraHourPriceOf,
  fromPriceOf,
  includeLinesOf,
  lengthRangeText,
  type PackageOffer,
} from "@/features/services-home/lib/services-home";

const nameOf = (product: ProductRow, isAr: boolean) =>
  (isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "";

const PLACES = {
  customer: { ar: "في موقعك", en: "At your place" },
  venue: { ar: "في موقعنا", en: "At our venue" },
  both: { ar: "في موقعك أو موقعنا", en: "At your place or ours" },
} as const;

/** One service: picture, "from" price, length, where, what the booking includes, its add-ons. */
export function ServiceCard({
  product,
  addOns,
}: {
  product: ProductRow;
  addOns: readonly ServiceOption[];
}) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  const price = fromPriceOf(product);
  const lengths = lengthRangeText(product, isAr);
  const place = PLACES[product.service_location as keyof typeof PLACES];
  const includes = includeLinesOf(product, isAr);
  const extra = extraHourPriceOf(product);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const optional = addOns.filter((o) => o.mode === "optional" || o.mode === "default_on");

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {product.image_url && (
        <img
          src={product.image_url}
          alt={nameOf(product, isAr)}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg text-foreground">{nameOf(product, isAr)}</h3>
          {price !== null && (
            <p className="shrink-0 text-end text-sm text-muted-foreground">
              {t("من", "From")}{" "}
              <span className="font-semibold text-foreground" dir="ltr">
                {formatPrice(price, currency, lang)}
              </span>
            </p>
          )}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {lengths && (
            <li className="flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              {lengths}
            </li>
          )}
          {place && (
            <li className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {isAr ? place.ar : place.en}
            </li>
          )}
        </ul>
        {includes.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">
              {t("يشمل الحجز", "The booking includes")}
            </p>
            <ul className="space-y-1">
              {includes.slice(0, 4).map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))}
            </ul>
            {includes.length > 4 && (
              <p className="text-xs text-muted-foreground">
                {t(`و${includes.length - 4} أخرى`, `and ${includes.length - 4} more`)}
              </p>
            )}
          </div>
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
        {detailsOpen && (
          <ServiceDetailsDialog
            product={product}
            addOns={addOns}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          />
        )}
      </div>
    </article>
  );
}

/** A package as an offer: the price against its services apart, the saving, what is in it. */
export function PackageOfferCard({
  product,
  offer,
  extraHour,
  look,
}: {
  product: ProductRow;
  offer: PackageOffer;
  extraHour: number | null;
  /** The merchant's package look (booking_page_options.package_style). */
  look: PackageStyle;
}) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  const own = includeLinesOf(product, isAr);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <article
      className={`${packageCardClass(look)} flex flex-col gap-3 p-5 ${look === "ribbon" ? "pt-10" : ""}`}
    >
      {look === "ribbon" && (
        <span className="pkg-tag" aria-hidden="true">
          <Gem className="size-3.5" />
          {t("باقة", "PACKAGE")}
        </span>
      )}
      {look !== "ribbon" && (
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("باقة", "Package")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-2xl leading-tight text-foreground">
          {nameOf(product, isAr)}
        </h3>
        {offer.saving && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {t(`وفّر ${offer.saving.percent}%`, `Save ${offer.saving.percent}%`)}
          </span>
        )}
      </div>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-foreground" dir="ltr">
          {formatPrice(offer.price, currency, lang)}
        </span>
        {offer.saving && offer.apart !== null && (
          <s className="text-sm text-muted-foreground" dir="ltr">
            {formatPrice(offer.apart, currency, lang)}
          </s>
        )}
      </p>
      {offer.includes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {offer.includes.map((item) => (
            <li
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-background/80 px-2.5 py-0.5 text-xs text-foreground"
            >
              <Check className="size-3 text-primary" aria-hidden="true" />
              {item.name}
              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
            </li>
          ))}
        </ul>
      )}
      {own.length > 0 && (
        <ul className="space-y-1">
          {own.slice(0, 4).map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 break-words">{line}</span>
            </li>
          ))}
          {own.length > 4 && (
            <li className="text-xs text-muted-foreground">
              {t(`و${own.length - 4} أخرى`, `and ${own.length - 4} more`)}
            </li>
          )}
        </ul>
      )}
      {extraHour !== null && (
        <p className="text-xs text-muted-foreground">
          {t("ساعة إضافية بسعرها المعتاد: ", "Extra hour at its usual price: ")}
          <span dir="ltr">{formatPrice(extraHour, currency, lang)}</span>
        </p>
      )}
      <div className="mt-auto grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={() => setDetailsOpen(true)}>
          {t("عرض التفاصيل", "View details")}
        </Button>
        <Button asChild>
          <Link to="/$slug/book" params={{ slug: brand.slug }} search={{ service: product.id }}>
            {t("احجز الباقة", "Book this package")}
          </Link>
        </Button>
      </div>
      {detailsOpen && (
        <ServiceDetailsDialog
          product={product}
          addOns={[]}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      )}
    </article>
  );
}
