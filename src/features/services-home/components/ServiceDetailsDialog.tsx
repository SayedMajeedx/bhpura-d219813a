import { useState } from "react";
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
  DialogTitle,
  PHONE_SHEET,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import {
  describeOption,
  optionDescription,
  optionName,
  optionPrice,
  priceWithDefaults,
  type ServiceOption,
} from "@/lib/bookings/service-options";
import type { ProductRow } from "@/lib/data/storefront";
import {
  extraHourPriceOf,
  includeLinesOf,
  lengthPrices,
  minutesText,
  serviceImages,
  servicePlace,
} from "@/features/services-home/lib/services-home";

/** A description longer than this folds to a few lines, with "Read more". */
const FOLDED_DESCRIPTION = 220;

/**
 * A service in full: its pictures, what it costs for each length, what the booking includes, its
 * add-ons. On a phone a sheet from the screen's foot (`PHONE_SHEET`), the photo first and whole,
 * the words under it, and the booking button kept in view at the foot; on a wider screen the same
 * in a window. `minutes` is the length chosen on the card: marked here and carried to the booking.
 */
export function ServiceDetailsDialog({
  product,
  addOns,
  open,
  onOpenChange,
  minutes = null,
}: {
  product: ProductRow;
  addOns: readonly ServiceOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minutes?: number | null;
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
  const place = servicePlace(product.service_location, isAr);
  const chosen = lengths.some((length) => length.minutes === minutes) ? minutes : null;
  // Folded, the description is its first paragraph, cut to a few lines: a cut at the blank line
  // between two paragraphs left a lone "…".
  const firstParagraph = description?.split(/\n\s*\n/)[0]?.trim() ?? "";
  const long =
    (description?.length ?? 0) > FOLDED_DESCRIPTION || firstParagraph !== (description ?? "");
  const [unfolded, setUnfolded] = useState(false);
  const money = (amount: number) => formatPrice(amount, currency, lang);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className={cn(
          "flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] sm:p-0",
          PHONE_SHEET,
          "max-sm:pb-0",
          // The window's own close button sits over the photo: give it a ground of its own.
          "[&>button:last-child]:size-9 [&>button:last-child]:rounded-full [&>button:last-child]:bg-background/90 [&>button:last-child]:opacity-100 [&>button:last-child]:shadow-sm",
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {images.length > 0 && (
            <Carousel opts={{ direction: isAr ? "rtl" : "ltr" }} className="bg-muted">
              <CarouselContent className="ms-0">
                {images.map((url, index) => (
                  <CarouselItem key={url} className="ps-0">
                    {/* The photo whole over a soft copy of itself, as on the card: a standing
                        booth is never cut to its middle. */}
                    <div className="relative aspect-[4/3] overflow-hidden sm:aspect-auto sm:h-[min(45dvh,24rem)]">
                      <img
                        src={url}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl"
                      />
                      <img
                        src={url}
                        alt={index === 0 ? name : ""}
                        loading="lazy"
                        className="absolute inset-0 size-full object-contain"
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {images.length > 1 && (
                <>
                  <CarouselPrevious className="left-3 bg-background/90 shadow-sm" />
                  <CarouselNext className="right-3 bg-background/90 shadow-sm" />
                </>
              )}
            </Carousel>
          )}

          <div className="space-y-6 p-5 sm:p-6">
            <header className={cn("space-y-2", images.length === 0 && "pe-10")}>
              <DialogTitle
                dir="auto"
                className="font-display text-2xl leading-tight text-balance text-page-start"
              >
                {name}
              </DialogTitle>
              {(place || extra !== null) && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {place && (
                    <li className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden="true" />
                      {place}
                    </li>
                  )}
                  {extra !== null && (
                    <li className="inline-flex items-center gap-1.5">
                      <Clock className="size-4" aria-hidden="true" />
                      {t("كل ساعة إضافية ", "Each extra hour ")}
                      <bdi>{money(extra)}</bdi>
                    </li>
                  )}
                </ul>
              )}
              {description ? (
                <div>
                  <DialogDescription
                    className={cn(
                      "whitespace-pre-line text-sm leading-relaxed text-foreground/80",
                      long && !unfolded && "line-clamp-4",
                    )}
                  >
                    {long && !unfolded ? firstParagraph : description}
                  </DialogDescription>
                  {long && (
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setUnfolded((was) => !was)}
                      aria-expanded={unfolded}
                      className="mt-1 h-auto min-h-11 px-0 sm:min-h-0"
                    >
                      {unfolded ? t("عرض أقل", "Show less") : t("اقرأ المزيد", "Read more")}
                    </Button>
                  )}
                </div>
              ) : (
                <DialogDescription className="sr-only">{name}</DialogDescription>
              )}
            </header>

            {lengths.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("المدة والسعر", "Length and price")}
                </h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {lengths.map((length) => {
                    const price = priceWithDefaults(
                      length.price,
                      addOns,
                      length.minutes,
                      lengths[0]?.minutes,
                    );
                    const was =
                      length.was !== null
                        ? priceWithDefaults(length.was, addOns, length.minutes, lengths[0]?.minutes)
                        : 0;
                    const isChosen = length.minutes === chosen;
                    return (
                      <li
                        key={length.minutes}
                        aria-current={isChosen ? "true" : undefined}
                        className={cn(
                          "rounded-xl border px-3 py-2.5",
                          isChosen ? "border-primary bg-primary/5" : "border-border",
                        )}
                      >
                        <p className="text-sm text-muted-foreground">
                          {minutesText(length.minutes, isAr)}
                        </p>
                        <p className="flex flex-wrap items-baseline gap-x-1.5">
                          <bdi className="font-semibold text-foreground">{money(price)}</bdi>
                          {was > price && (
                            <s className="text-xs text-muted-foreground">
                              <bdi>{money(was)}</bdi>
                            </s>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {includes.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("يشمل الحجز", "The booking includes")}
                </h3>
                <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
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
                <h3 className="text-sm font-semibold text-foreground">
                  {t("الإضافات", "Add-ons")}
                </h3>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {addOns.map((option) => (
                    <li key={option.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-foreground">
                          {optionName(option, isAr)}
                        </p>
                        {optionDescription(option, isAr) && (
                          <p className="text-xs text-muted-foreground">
                            {optionDescription(option, isAr)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {describeOption(option, isAr)}
                        </p>
                      </div>
                      {option.mode !== "included" && !option.tiers && (
                        <bdi className="shrink-0 text-sm font-semibold text-foreground">
                          {money(optionPrice(option))}
                        </bdi>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        {/* The booking stays in view at the foot, above the phone's home bar. */}
        <div className="border-t border-border bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
          <Button asChild size="lg" className="w-full">
            <Link
              to="/$slug/book"
              params={{ slug: brand.slug }}
              search={{ service: product.id, ...(chosen !== null ? { minutes: chosen } : {}) }}
            >
              {t("احجز هذه الخدمة", "Book this service")}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
