import { Link } from "@tanstack/react-router";
import { Check, Clock, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { optionName, type ServiceOption } from "@/lib/bookings/service-options";
import type { ProductRow } from "@/lib/data/storefront";
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
        <Button asChild variant="outline" className="mt-auto">
          <Link to="/$slug/product/$id" params={{ slug: brand.slug, id: product.id }}>
            {t("التفاصيل والحجز", "Details and booking")}
          </Link>
        </Button>
      </div>
    </article>
  );
}

/** A package as an offer: the price against its services apart, the saving, what is in it. */
export function PackageOfferCard({
  product,
  offer,
  extraHour,
}: {
  product: ProductRow;
  offer: PackageOffer;
  extraHour: number | null;
}) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  return (
    <article className="relative flex flex-col gap-3 rounded-2xl border border-primary/30 bg-card p-5">
      {offer.saving && (
        <span className="absolute -top-3 end-4 rounded-full bg-success px-3 py-1 text-xs font-semibold text-success-foreground">
          {t(`وفّر ${offer.saving.percent}%`, `Save ${offer.saving.percent}%`)}
        </span>
      )}
      <h3 className="font-display text-xl text-foreground">{nameOf(product, isAr)}</h3>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold text-foreground" dir="ltr">
          {formatPrice(offer.price, currency, lang)}
        </span>
        {offer.saving && offer.apart !== null && (
          <s className="text-sm text-muted-foreground" dir="ltr">
            {formatPrice(offer.apart, currency, lang)}
          </s>
        )}
      </p>
      <ul className="space-y-1.5">
        {offer.includes.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 break-words">
              {item.name}
              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {extraHour !== null && (
        <p className="text-xs text-muted-foreground">
          {t("ساعة إضافية بسعرها المعتاد: ", "Extra hour at its usual price: ")}
          <span dir="ltr">{formatPrice(extraHour, currency, lang)}</span>
        </p>
      )}
      <Button asChild className="mt-auto">
        <Link to="/$slug/product/$id" params={{ slug: brand.slug, id: product.id }}>
          {t("اختر الباقة", "Choose this package")}
        </Link>
      </Button>
    </article>
  );
}
