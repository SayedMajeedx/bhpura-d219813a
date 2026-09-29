import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/storefront-context";
import { fromPrice, serviceName } from "@/features/storefront-booking/lib/booking-flow";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";

/** Step 2: one or more services, each at its "from" price. */
export function BookingServicePicker({ flow }: { flow: BookingFlow }) {
  const { isAr, services, currency, showPrices } = flow;

  if (!flow.servicesLoading && services.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isAr ? "لا توجد خدمات متاحة للحجز حالياً." : "No services are open for booking yet."}
      </p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {services.map((service) => {
        const chosen = flow.flow.services.includes(service.id);
        const price = fromPrice(service);
        return (
          <li key={service.id}>
            <Button
              type="button"
              variant="outline"
              role="checkbox"
              aria-checked={chosen}
              onClick={() => flow.toggleService(service.id)}
              className={cn(
                "flex h-auto w-full items-center justify-start gap-3 whitespace-normal rounded-xl p-2 text-start font-normal",
                chosen && "border-primary bg-primary/5",
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
                <span className="size-14 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {serviceName(service, isAr)}
                </span>
                {showPrices && price !== null && (
                  <span className="block text-xs text-muted-foreground">
                    {isAr ? "من " : "From "}
                    {formatPrice(price, currency, isAr ? "ar" : "en")}
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
          </li>
        );
      })}
    </ul>
  );
}
