import { Check, Gem, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/storefront-context";
import { packageCardClass, packageSavingPercent } from "@/lib/bookings/package-style";
import {
  compareAtFor,
  priceFor,
  serviceDurations,
  serviceName,
  type BookableService,
} from "@/features/storefront-booking/lib/booking-flow";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";

/**
 * A package in the service list: it stands out from a service with the
 * merchant's chosen look (a foil border, depth and a tint in the brand colour;
 * Aura, Sheen, Ribbon or Classic), a "Package" mark, what it includes and what
 * it saves.
 */
export function BookingPackageCard({
  flow,
  service,
}: {
  flow: BookingFlow;
  service: BookableService;
}) {
  const { isAr, currency, showPrices } = flow;
  const chosen = flow.flow.services.includes(service.id);
  const minutes = flow.flow.durationMinutes;
  const price = priceFor(service, minutes);
  const was = compareAtFor(service, minutes);
  const saving = packageSavingPercent(was, price);
  const from = !minutes && serviceDurations(service).length > 0;
  const includes = flow.includesList(service.id);
  const style = flow.packageStyle;
  const lang = isAr ? "ar" : "en";

  return (
    <Button
      type="button"
      variant="ghost"
      role="checkbox"
      aria-checked={chosen}
      onClick={() => flow.toggleService(service.id)}
      className={cn(
        packageCardClass(style),
        "flex h-auto w-full items-start justify-start gap-4 whitespace-normal p-4 text-start font-normal hover:bg-transparent",
        style === "ribbon" && "pt-9",
        chosen && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {style === "ribbon" && (
        <span className="pkg-tag" aria-hidden="true">
          <Gem className="size-3.5" />
          {isAr ? "باقة" : "PACKAGE"}
        </span>
      )}
      {service.image_url ? (
        <img
          src={service.image_url}
          alt=""
          loading="lazy"
          className="size-20 shrink-0 rounded-xl object-cover shadow-md ring-1 ring-primary/30"
        />
      ) : (
        <span
          className="grid size-20 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30"
          aria-hidden="true"
        >
          <Gem className="size-8" />
        </span>
      )}
      <span className="min-w-0 flex-1 space-y-2">
        {style !== "ribbon" && (
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {isAr ? "باقة" : "Package"}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xl leading-tight text-foreground">
            {serviceName(service, isAr)}
          </span>
          {saving !== null && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
              {isAr ? `وفّر ${saving}%` : `Save ${saving}%`}
            </span>
          )}
        </span>
        {includes.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {includes.map((line) => (
              <span
                key={line}
                className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-background/80 px-2.5 py-0.5 text-xs text-foreground"
              >
                <Check className="size-3 text-primary" aria-hidden="true" />
                {line}
              </span>
            ))}
          </span>
        )}
        {showPrices && price !== null && (
          <span className="flex items-baseline gap-2">
            <span className="font-display text-lg font-semibold text-foreground" dir="ltr">
              {from && (isAr ? "من " : "From ")}
              {formatPrice(price, currency, lang)}
            </span>
            {was !== null && (
              <s className="text-sm font-normal text-muted-foreground" dir="ltr">
                {formatPrice(was, currency, lang)}
              </s>
            )}
          </span>
        )}
      </span>
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full border-2",
          chosen ? "border-primary bg-primary text-primary-foreground" : "border-primary/40",
        )}
        aria-hidden="true"
      >
        {chosen && <Check className="size-4" />}
      </span>
    </Button>
  );
}
