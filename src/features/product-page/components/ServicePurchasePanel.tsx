import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { bookingsQueries } from "@/lib/data/bookings";
import { formatDuration } from "@/lib/bookings/format";
import { serviceIncludesFrom, serviceLocationFrom } from "@/lib/bookings/service-details";

type ServiceProduct = {
  id: string;
  service_location?: string | null;
  service_includes?: unknown;
  product_variants: ReadonlyArray<{
    id: string;
    selling_price: number;
    original_price?: number | null;
    duration_minutes?: number | null;
  }>;
};

const PLACE_TEXT = {
  customer: { ar: "نأتي إليك في موقع مناسبتك", en: "We come to your venue" },
  venue: { ar: "تُقدَّم في مقرّنا", en: "Held at our venue" },
  both: { ar: "عندك أو في مقرّنا", en: "At your venue or ours" },
} as const;

/**
 * How a service is bought on its page: pick a length (each with its price),
 * see where it happens, what it includes and the deposit, then book. The
 * length goes to the booking page, which starts with it chosen.
 */
export function ServicePurchasePanel({ product }: { product: ServiceProduct }) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  const rules = useQuery(bookingsQueries.publicRules(brand.id)).data;

  const lengths = product.product_variants
    .filter((variant) => typeof variant.duration_minutes === "number")
    .sort((a, b) => Number(a.duration_minutes) - Number(b.duration_minutes));
  const [chosenId, setChosenId] = useState<string | null>(lengths[0]?.id ?? null);
  const chosen =
    lengths.find((variant) => variant.id === chosenId) ??
    [...product.product_variants].sort((a, b) => a.selling_price - b.selling_price)[0];
  const price = Number(chosen?.selling_price ?? 0);
  const was = Number(chosen?.original_price ?? 0);
  const place = serviceLocationFrom(product.service_location);
  const includes = serviceIncludesFrom(product.service_includes).filter((line) =>
    isAr ? line.ar || line.en : line.en || line.ar,
  );
  const deposit = Number(rules?.deposit_percent ?? 0);

  return (
    <section className="space-y-4" aria-label={t("احجز الخدمة", "Book the service")}>
      {lengths.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            {t("اختر المدة", "Choose a length")}
          </p>
          <div role="radiogroup" aria-label={t("المدة", "Length")} className="flex flex-wrap gap-2">
            {lengths.map((variant) => {
              const selected = variant.id === chosen?.id;
              return (
                <Button
                  key={variant.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  variant="outline"
                  onClick={() => setChosenId(variant.id)}
                  className={cn(
                    "h-auto min-w-24 flex-col gap-0.5 whitespace-normal rounded-xl px-3 py-2",
                    selected && "border-primary bg-primary/10 ring-1 ring-primary",
                  )}
                >
                  <span className="text-sm font-semibold">
                    {formatDuration(Number(variant.duration_minutes), isAr)}
                  </span>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {formatPrice(Number(variant.selling_price), currency, lang)}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {price > 0 && (
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground" dir="ltr">
            {formatPrice(price, currency, lang)}
          </span>
          {was > price && (
            <span className="text-sm text-muted-foreground line-through" dir="ltr">
              {formatPrice(was, currency, lang)}
            </span>
          )}
        </p>
      )}

      <Button asChild size="lg" className="w-full gap-2">
        <Link
          to="/$slug/book"
          params={{ slug: brand.slug }}
          search={{
            service: product.id,
            minutes: chosen?.duration_minutes ?? undefined,
          }}
        >
          <CalendarDays className="size-5" aria-hidden="true" />
          {t("اختر اليوم والوقت واحجز", "Pick a date & time to book")}
        </Link>
      </Button>

      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {place && (
          <li className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {isAr ? PLACE_TEXT[place].ar : PLACE_TEXT[place].en}
          </li>
        )}
        <li className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {deposit > 0
            ? t(
                `احجز موعدك بعربون ${deposit}٪ والباقي يوم المناسبة`,
                `Hold your date with a ${deposit}% deposit, the rest on the day`,
              )
            : t(
                "تشوف الأيام المتاحة وتختار وقتك في دقيقة",
                "See the free days and pick your time in a minute",
              )}
        </li>
      </ul>

      {includes.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("ما تشمله الخدمة", "What's included")}
          </p>
          <ul className="space-y-1.5">
            {includes.map((line, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  {isAr ? line.ar || line.en : line.en || line.ar}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
