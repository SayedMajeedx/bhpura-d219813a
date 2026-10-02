import { Check, Package } from "lucide-react";
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
 * A package in the service list: it stands out from a service with a tinted
 * card in the merchant's chosen look (glow, shimmer, ribbon or plain), a
 * "Package" badge, what it includes and what it saves.
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
      variant="outline"
      role="checkbox"
      aria-checked={chosen}
      onClick={() => flow.toggleService(service.id)}
      className={cn(
        packageCardClass(style),
        "flex h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-2xl p-3 text-start font-normal hover:bg-transparent",
        chosen && "border-primary ring-2 ring-primary/40",
      )}
    >
      {style === "ribbon" && (
        <span
          className="absolute end-0 top-0 rounded-es-xl bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {isAr ? "باقة" : "Package"}
        </span>
      )}
      {service.image_url ? (
        <img
          src={service.image_url}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span
          className="grid size-16 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Package className="size-7" />
        </span>
      )}
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-foreground">
            {serviceName(service, isAr)}
          </span>
          {style !== "ribbon" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              <Package className="size-3" aria-hidden="true" />
              {isAr ? "باقة" : "Package"}
            </span>
          )}
          {saving !== null && (
            <span className="rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-foreground">
              {isAr ? `وفّر ${saving}%` : `Save ${saving}%`}
            </span>
          )}
        </span>
        {includes.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {includes.map((line) => (
              <span
                key={line}
                className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {line}
              </span>
            ))}
          </span>
        )}
        {showPrices && price !== null && (
          <span className="block text-sm font-semibold text-foreground">
            {from && (isAr ? "من " : "From ")}
            {formatPrice(price, currency, lang)}
            {was !== null && (
              <s className="ms-2 text-xs font-normal text-muted-foreground">
                {formatPrice(was, currency, lang)}
              </s>
            )}
          </span>
        )}
      </span>
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border",
          chosen ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
        aria-hidden="true"
      >
        {chosen && <Check className="size-4" />}
      </span>
    </Button>
  );
}
