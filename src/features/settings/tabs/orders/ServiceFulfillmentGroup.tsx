import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";

/**
 * Where a service happens, for a store that takes bookings: at the customer's
 * venue (always, with the travel fee of its area) or at the store's own
 * place. Replaces the shop's shipping zones and delivery estimates, which a
 * booked service does not use. Travel fees and the deposit are in the
 * booking rules.
 */
export function ServiceFulfillmentGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            <span>{isAr ? "مكان تقديم الخدمة" : "Where your services happen"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "يختار عميلك عند الحجز أين تُقدَّم الخدمة. لا توجد مناطق شحن لأن الخدمة تُقدَّم بموعد."
              : "Your customer chooses where the service happens when booking. There are no shipping zones: a service is delivered at an appointment."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {isAr ? "عند العميل" : "At the customer's venue"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAr
                  ? "دائماً متاح، ورسوم التنقل حسب منطقة المناسبة."
                  : "Always on; the travel fee depends on the event's area."}
              </p>
            </div>
            <Switch checked disabled aria-label={isAr ? "عند العميل" : "At the customer's venue"} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Store className="size-3.5 shrink-0" aria-hidden="true" />
                {isAr ? "في مقرّكم" : "At your place"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAr
                  ? "يأتي العميل إليكم، ولا رسوم تنقل."
                  : "The customer comes to you, with no travel fee."}
              </p>
            </div>
            <Switch
              checked={bs.pickup_enabled ?? true}
              onCheckedChange={(value) => setBs({ pickup_enabled: value })}
              aria-label={isAr ? "في مقرّكم" : "At your place"}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            <span>{isAr ? "رسوم التنقل والعربون" : "Travel fees & deposit"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "رسوم التنقل لكل منطقة، والعربون، وأوقات العمل، كلها في قواعد الحجز."
              : "Travel fees by area, the deposit and your hours are all in the booking rules."}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/b/$slug/bookings" params={{ slug: brand.slug }}>
            {isAr ? "فتح قواعد الحجز" : "Open booking rules"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
