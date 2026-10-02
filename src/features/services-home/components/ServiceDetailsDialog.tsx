import { Link } from "@tanstack/react-router";
import { Check, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import {
  describeOption,
  optionDescription,
  optionName,
  optionPrice,
  type ServiceOption,
} from "@/lib/bookings/service-options";
import type { ProductRow } from "@/lib/data/storefront";
import {
  extraHourPriceOf,
  includeLinesOf,
  lengthPrices,
  minutesText,
  serviceImages,
} from "@/features/services-home/lib/services-home";

const PLACES = {
  customer: { ar: "في موقعك", en: "At your place" },
  venue: { ar: "في موقعنا", en: "At our venue" },
  both: { ar: "في موقعك أو موقعنا", en: "At your place or ours" },
} as const;

/** A service in full: its pictures, what it costs for each length, what the booking includes, its add-ons. */
export function ServiceDetailsDialog({
  product,
  addOns,
  open,
  onOpenChange,
}: {
  product: ProductRow;
  addOns: readonly ServiceOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  const name = (isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "";
  const description = (
    isAr
      ? product.description_ar || product.description_en
      : product.description_en || product.description_ar
  )?.trim();
  const images = serviceImages(product);
  const lengths = lengthPrices(product);
  const includes = includeLinesOf(product, isAr);
  const extra = extraHourPriceOf(product);
  const place = PLACES[product.service_location as keyof typeof PLACES];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{name}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description || name}
          </DialogDescription>
        </DialogHeader>

        {images.length > 0 && (
          <Carousel opts={{ direction: isAr ? "rtl" : "ltr" }} className="mx-10">
            <CarouselContent>
              {images.map((url) => (
                <CarouselItem key={url}>
                  <img
                    src={url}
                    alt={name}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-xl object-cover"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            {images.length > 1 && (
              <>
                <CarouselPrevious />
                <CarouselNext />
              </>
            )}
          </Carousel>
        )}

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {place && (
            <li className="flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              {isAr ? place.ar : place.en}
            </li>
          )}
          {extra !== null && (
            <li className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden="true" />
              {t("ساعة إضافية: ", "Extra hour: ")}
              <span dir="ltr">{formatPrice(extra, currency, lang)}</span>
            </li>
          )}
        </ul>

        {lengths.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {t("المدة والسعر", "Length and price")}
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {lengths.map((length) => (
                <li
                  key={length.minutes}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="text-foreground">{minutesText(length.minutes, isAr)}</span>
                  <span className="font-semibold text-foreground" dir="ltr">
                    {formatPrice(length.price, currency, lang)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {includes.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {t("يشمل الحجز", "The booking includes")}
            </h3>
            <ul className="space-y-1.5">
              {includes.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {addOns.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{t("الإضافات", "Add-ons")}</h3>
            <ul className="space-y-2">
              {addOns.map((option) => (
                <li
                  key={option.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{optionName(option, isAr)}</p>
                    {optionDescription(option, isAr) && (
                      <p className="text-xs text-muted-foreground">
                        {optionDescription(option, isAr)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{describeOption(option, isAr)}</p>
                  </div>
                  {option.mode !== "included" && !option.tiers && (
                    <span className="shrink-0 font-semibold text-foreground" dir="ltr">
                      {formatPrice(optionPrice(option), currency, lang)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Button asChild size="lg" className="w-full">
          <Link to="/$slug/book" params={{ slug: brand.slug }} search={{ service: product.id }}>
            {t("احجز هذه الخدمة", "Book this service")}
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
