import { BookingPackageCard } from "@/features/storefront-booking/components/BookingPackageCard";
import { BookingServiceOptions } from "@/features/storefront-booking/components/BookingServiceOptions";
import { Camera, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/storefront-context";
import { SERVICE_KIND_LABELS, groupByKind, type ServiceKind } from "@/lib/bookings/service-kind";
import {
  compareAtFor,
  priceFor,
  serviceDurations,
  serviceName,
  type BookableService,
} from "@/features/storefront-booking/lib/booking-flow";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";

/** A service or a rental in the list: a plain row, or (a rental) a ticket with a Rental mark. */
function ServiceRow({
  flow,
  service,
  kind,
}: {
  flow: BookingFlow;
  service: BookableService;
  kind: ServiceKind;
}) {
  const { isAr, currency, showPrices } = flow;
  const rental = kind === "rental";
  const chosen = flow.flow.services.includes(service.id);
  const minutes = flow.flow.durationMinutes;
  const price = priceFor(service, minutes);
  const was = compareAtFor(service, minutes);
  // "From" until a duration is chosen for a service priced by duration.
  const from = !minutes && serviceDurations(service).length > 0;
  return (
    <Button
      type="button"
      variant="outline"
      role="checkbox"
      aria-checked={chosen}
      onClick={() => flow.toggleService(service.id)}
      className={cn(
        "flex h-auto w-full items-center justify-start gap-3 whitespace-normal rounded-xl p-2 text-start font-normal",
        rental && "rental-card rounded-xl p-3 hover:bg-transparent",
        chosen &&
          (rental
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : "border-primary bg-primary/5"),
      )}
    >
      {service.image_url ? (
        <img
          src={service.image_url}
          alt=""
          loading="lazy"
          className="size-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-lg",
            rental ? "bg-primary/10 text-primary" : "bg-muted",
          )}
          aria-hidden="true"
        >
          {rental && <Camera className="size-6" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        {rental && (
          <span className="mb-0.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Camera className="size-3" aria-hidden="true" />
            {isAr ? SERVICE_KIND_LABELS.rental.ar : SERVICE_KIND_LABELS.rental.en}
          </span>
        )}
        <span
          className={cn(
            "block text-sm font-semibold text-foreground",
            rental && "font-display text-base",
          )}
        >
          {serviceName(service, isAr)}
        </span>
        {showPrices && price !== null && (
          <span className="block text-xs text-muted-foreground">
            {from && (isAr ? "من " : "From ")}
            {formatPrice(price, currency, isAr ? "ar" : "en")}
            {was !== null && (
              <s className="ms-1.5 opacity-70">{formatPrice(was, currency, isAr ? "ar" : "en")}</s>
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

/** Step 2: one or more services, each at its "from" price: packages, rentals, then the rest. */
export function BookingServicePicker({ flow }: { flow: BookingFlow }) {
  const { isAr, services } = flow;

  if (!flow.servicesLoading && services.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isAr ? "لا توجد خدمات متاحة للحجز حالياً." : "No services are open for booking yet."}
      </p>
    );
  }

  const groups = groupByKind(services);
  const kinds = (["package", "rental", "service"] as const).filter(
    (kind) => groups[kind].length > 0,
  );
  // Headings only help when the store sells more than one kind.
  const grouped = kinds.length > 1;

  return (
    <div className="space-y-5">
      {kinds.map((kind) => {
        const label = isAr
          ? SERVICE_KIND_LABELS[kind].headingAr
          : SERVICE_KIND_LABELS[kind].headingEn;
        return (
          <section key={kind} className="space-y-2" aria-label={label}>
            {grouped && <h3 className="text-sm font-semibold text-foreground">{label}</h3>}
            <ul className={cn("grid gap-3", kind !== "package" && "sm:grid-cols-2")}>
              {groups[kind].map((service) => (
                <li key={service.id}>
                  {kind === "package" ? (
                    <BookingPackageCard flow={flow} service={service} />
                  ) : (
                    <ServiceRow flow={flow} service={service} kind={kind} />
                  )}
                  {flow.flow.services.includes(service.id) && (
                    <BookingServiceOptions flow={flow} serviceId={service.id} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
