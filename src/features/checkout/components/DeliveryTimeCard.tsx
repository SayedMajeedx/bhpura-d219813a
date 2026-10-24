import { useId } from "react";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dayLabel, slotLabel, slotValue } from "@/lib/delivery-schedule";
import type { DeliveryTime } from "@/features/checkout/hooks/use-delivery-time";

const chip = (active: boolean) =>
  cn(
    "h-auto min-h-11 shrink-0 snap-start rounded-xl border-2 px-4 py-2 text-sm font-semibold",
    active ? "border-primary bg-primary/10 text-foreground" : "border-border",
  );

/**
 * The day, and the time window, a shopper wants the order: the days the store's schedule offers
 * (`deliveryDays`), as one sideways row of chips, then the chosen day's windows.
 */
export function DeliveryTimeCard({
  time,
  fulfillment,
  lang,
  t,
}: {
  time: DeliveryTime;
  fulfillment: string;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
}) {
  const daysId = useId();
  const slotsId = useId();
  if (!time.applies) return null;
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-5 text-primary" aria-hidden="true" />
        <h2 className="font-display text-xl">
          {fulfillment === "pickup"
            ? t("متى تستلم طلبك؟", "When will you collect it?")
            : t("متى تريد طلبك؟", "When would you like it?")}
        </h2>
      </div>

      {time.now && time.days.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "لا مواعيد متاحة حالياً؛ سيتواصل معك المتجر لتحديد الموعد.",
            "No days are open right now; the store will contact you to agree one.",
          )}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p id={daysId} className="text-sm font-medium text-muted-foreground">
              {t("اليوم", "Day")}
            </p>
            <div
              role="group"
              aria-labelledby={daysId}
              className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
            >
              {time.now &&
                time.days.map((day) => (
                  <Button
                    key={day.date}
                    type="button"
                    variant="ghost"
                    aria-pressed={time.date === day.date}
                    onClick={() => time.pickDate(day.date)}
                    className={chip(time.date === day.date)}
                  >
                    {dayLabel(day.date, time.schedule, time.now as Date, lang)}
                  </Button>
                ))}
            </div>
          </div>

          {time.slotsOfDay.length > 0 && (
            <div className="space-y-2">
              <p id={slotsId} className="text-sm font-medium text-muted-foreground">
                {t("الوقت", "Time")}
              </p>
              <div role="group" aria-labelledby={slotsId} className="flex flex-wrap gap-2">
                {time.slotsOfDay.map((slot) => {
                  const value = slotValue(slot);
                  return (
                    <Button
                      key={value}
                      type="button"
                      variant="ghost"
                      aria-pressed={time.slot === value}
                      onClick={() => time.pickSlot(value)}
                      className={chip(time.slot === value)}
                    >
                      <span dir="ltr">{slotLabel(value)}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
