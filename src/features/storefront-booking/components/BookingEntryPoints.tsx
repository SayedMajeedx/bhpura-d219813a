import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStorefront, useStoreModules } from "@/lib/storefront-context";

/**
 * Where a customer starts a booking: a "book a date" band on the home page
 * and a "book this service" button on a service's page. Both show only for
 * stores with the bookings module.
 */

export function BookingInvite() {
  const { brand, t } = useStorefront();
  const modules = useStoreModules();
  if (!modules.bookings) return null;
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center sm:flex-row sm:justify-between sm:text-start">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <CalendarDays className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl text-foreground">
              {t("احجز مناسبتك", "Book your date")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "شوف التواريخ المتاحة واختر خدماتك في دقيقة.",
                "See the free dates and choose your services in a minute.",
              )}
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link to="/$slug/book" params={{ slug: brand.slug }}>
            {t("شوف التواريخ المتاحة", "See available dates")}
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function BookServiceButton({ productId }: { productId: string }) {
  const { brand, t } = useStorefront();
  const modules = useStoreModules();
  if (!modules.bookings) return null;
  return (
    <Button asChild size="lg" className="w-full gap-2">
      <Link to="/$slug/book" params={{ slug: brand.slug }} search={{ service: productId }}>
        <CalendarDays className="size-5" aria-hidden="true" />
        {t("احجز هذه الخدمة", "Book this service")}
      </Link>
    </Button>
  );
}
