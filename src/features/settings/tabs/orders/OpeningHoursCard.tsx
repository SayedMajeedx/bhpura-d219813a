import { useEffect, useId, useState } from "react";
import { Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { GCC_TIMEZONES } from "@/lib/delivery-schedule";
import {
  DEFAULT_HOURS,
  intakeSentence,
  orderIntake,
  readHours,
  storedHours,
  type OpeningHours,
} from "@/lib/opening-hours";

/** The week as a Gulf store reads it, from Saturday. */
const WEEK = [
  { day: 6, ar: "السبت", en: "Saturday" },
  { day: 0, ar: "الأحد", en: "Sunday" },
  { day: 1, ar: "الإثنين", en: "Monday" },
  { day: 2, ar: "الثلاثاء", en: "Tuesday" },
  { day: 3, ar: "الأربعاء", en: "Wednesday" },
  { day: 4, ar: "الخميس", en: "Thursday" },
  { day: 5, ar: "الجمعة", en: "Friday" },
];

const chip = (on: boolean) =>
  cn("h-9 rounded-full px-3 text-xs", on && "border-primary bg-primary/10 text-foreground");

/** Midnight as an end is the day's end ("24:00"); a time field writes it "00:00". */
const endOf = (value: string) => (value === "00:00" ? "24:00" : value);
const fieldOf = (value: string) => (value === "24:00" ? "00:00" : value);

/**
 * The store's opening hours (`business_settings.opening_hours`): one window a weekday on the
 * store's clock, and what happens to an order outside them, taken and handled when the store
 * opens (the default) or refused. The line at the foot says what a shopper is told now, by the
 * rule the storefront and the database use (`orderIntake`).
 */
export function OpeningHoursCard() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const stored = form.bs.opening_hours;
  const empty =
    !stored || (typeof stored === "object" && Object.keys(stored as object).length === 0);
  const hours: OpeningHours = empty ? DEFAULT_HOURS : readHours(stored);
  const set = (patch: Partial<OpeningHours>) =>
    setBs({ opening_hours: storedHours({ ...hours, ...patch }) });
  const setDay = (day: number, window: { from: string; to: string } | null) =>
    set({ days: hours.days.map((list, d) => (d === day ? (window ? [window] : []) : list)) });
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const ids = { zone: useId(), after: useId() };
  const said =
    now && hours.enabled
      ? intakeSentence(
          orderIntake({ opening_hours: storedHours(hours) }, now),
          storedHours(hours),
          now,
          lang,
        )
      : null;

  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {isAr ? "ساعات العمل" : "Opening hours"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "يرى العميل خارجها متى يُجهَّز طلبه. للإيقاف السريع وقت الانشغال استخدم لوحة التحكم."
                : "Outside them shoppers are told when their order is handled. For a quick pause when busy, use the dashboard."}
            </p>
          </div>
        </div>
        <Switch
          checked={hours.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          aria-label={isAr ? "ساعات العمل" : "Opening hours"}
        />
      </div>

      {hours.enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            {WEEK.map(({ day, ar, en }) => {
              const window = hours.days[day][0] ?? null;
              const name = isAr ? ar : en;
              return (
                <div key={day} className="flex flex-wrap items-center gap-2">
                  <span className="w-24 shrink-0 text-sm">{name}</span>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={Boolean(window)}
                    className={chip(Boolean(window))}
                    onClick={() => setDay(day, window ? null : { from: "10:00", to: "22:00" })}
                  >
                    {window ? (isAr ? "مفتوح" : "Open") : isAr ? "مغلق" : "Closed"}
                  </Button>
                  {window && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="time"
                        aria-label={isAr ? `يفتح ${name}` : `${name} opens`}
                        className="h-9 w-28 text-xs tabular-nums"
                        value={window.from}
                        onChange={(e) => setDay(day, { ...window, from: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input
                        type="time"
                        aria-label={isAr ? `يغلق ${name}` : `${name} closes`}
                        className="h-9 w-28 text-xs tabular-nums"
                        value={fieldOf(window.to)}
                        onChange={(e) => setDay(day, { ...window, to: endOf(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={ids.zone} className="text-xs font-medium">
                {isAr ? "التوقيت" : "Time zone"}
              </Label>
              <select
                id={ids.zone}
                className="h-9 w-full max-w-full rounded-md border border-input bg-background px-3 text-xs"
                value={hours.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
              >
                {GCC_TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {isAr ? zone.ar : zone.en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <p id={ids.after} className="text-xs font-medium">
              {isAr ? "طلب يصل خارج ساعات العمل" : "An order placed outside the hours"}
            </p>
            <div role="group" aria-labelledby={ids.after} className="flex flex-wrap gap-2">
              {(["accept", "refuse"] as const).map((choice) => (
                <Button
                  key={choice}
                  type="button"
                  variant="outline"
                  aria-pressed={hours.after_hours === choice}
                  className={chip(hours.after_hours === choice)}
                  onClick={() => set({ after_hours: choice })}
                >
                  {choice === "accept"
                    ? isAr
                      ? "يُقبل ويُجهَّز عند الفتح"
                      : "Take it, handle it when open"
                    : isAr
                      ? "لا يُقبل حتى الفتح"
                      : "Refuse it until open"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الحجوزات لا تتأثر بساعات العمل."
                : "Bookings are not affected by the opening hours."}
            </p>
          </div>

          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs" role="status">
            {said
              ? isAr
                ? `يرى العميل الآن: ${said}`
                : `Shoppers see now: ${said}`
              : isAr
                ? "المتجر مفتوح الآن."
                : "The store is open now."}
          </p>
        </div>
      )}
    </section>
  );
}
