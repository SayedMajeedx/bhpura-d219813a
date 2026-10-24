import { useEffect, useId, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  GCC_TIMEZONES,
  dayLabel,
  deliveryDays,
  readSchedule,
  slotLabel,
  slotValue,
  type DeliverySchedule,
  type DeliverySlot,
} from "@/lib/delivery-schedule";

/** The week as a Gulf store reads it, from Saturday. */
const WEEK = [
  { day: 6, ar: "السبت", en: "Sat" },
  { day: 0, ar: "الأحد", en: "Sun" },
  { day: 1, ar: "الإثنين", en: "Mon" },
  { day: 2, ar: "الثلاثاء", en: "Tue" },
  { day: 3, ar: "الأربعاء", en: "Wed" },
  { day: 4, ar: "الخميس", en: "Thu" },
  { day: 5, ar: "الجمعة", en: "Fri" },
];

const chip = (on: boolean) =>
  cn("h-9 rounded-full px-3 text-xs", on && "border-primary bg-primary/10 text-foreground");

/**
 * The store's delivery schedule (`business_settings.delivery_schedule`): whether shoppers pick the
 * day (and time) they want their order at checkout, how much notice the store needs, how far ahead,
 * on which days, in which windows and on which clock. It shows the days a shopper would be offered
 * now, by the same rule the checkout and the database use (`deliveryDays`).
 */
export function DeliveryScheduleCard() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const schedule = readSchedule(form.bs.delivery_schedule);
  // The windows as typed: one being edited may end before it starts for a moment, and would
  // vanish if read through readSchedule (which, like the checkout and the database, ignores it).
  const raw = form.bs.delivery_schedule as { slots?: unknown } | null | undefined;
  const typed: DeliverySlot[] = Array.isArray(raw?.slots)
    ? (raw.slots as DeliverySlot[]).filter((slot) => slot && typeof slot === "object")
    : [];
  const set = (patch: Partial<DeliverySchedule>) =>
    setBs({ delivery_schedule: { ...schedule, slots: typed, ...patch } });
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const ids = { lead: useId(), ahead: useId(), zone: useId(), week: useId(), applies: useId() };
  const preview = now && schedule.enabled ? deliveryDays(schedule, now).slice(0, 5) : [];

  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {isAr ? "يختار العميل يوم الاستلام ووقته" : "Shoppers pick the day and time"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "للزهور والهدايا والحلويات المحضّرة ليوم محدد: يظهر في الدفع ويُحفظ في الطلب."
                : "For flowers, gifts and bakes made for a set day: asked at checkout and kept on the order."}
            </p>
          </div>
        </div>
        <Switch
          checked={schedule.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          aria-label={isAr ? "يختار العميل يوم الاستلام" : "Shoppers pick the day"}
        />
      </div>

      {schedule.enabled && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p id={ids.applies} className="text-xs font-medium">
              {isAr ? "يُسأل عنه في" : "Asked for"}
            </p>
            <div role="group" aria-labelledby={ids.applies} className="flex flex-wrap gap-2">
              {(["delivery", "pickup"] as const).map((way) => {
                const on = schedule.applies_to.includes(way);
                return (
                  <Button
                    key={way}
                    type="button"
                    variant="outline"
                    aria-pressed={on}
                    className={chip(on)}
                    onClick={() =>
                      set({
                        applies_to: on
                          ? schedule.applies_to.filter((w) => w !== way)
                          : [...schedule.applies_to, way],
                      })
                    }
                  >
                    {way === "delivery"
                      ? isAr
                        ? "التوصيل"
                        : "Delivery"
                      : isAr
                        ? "الاستلام"
                        : "Pickup"}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={ids.lead} className="text-xs font-medium">
                {isAr ? "ساعات التحضير قبل أول موعد" : "Hours you need before the first slot"}
              </Label>
              <Input
                id={ids.lead}
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                className="h-9 text-xs tabular-nums"
                value={schedule.lead_hours}
                onChange={(e) => set({ lead_hours: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={ids.ahead} className="text-xs font-medium">
                {isAr ? "كم يوماً للأمام يمكن الاختيار" : "How many days ahead"}
              </Label>
              <Input
                id={ids.ahead}
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                className="h-9 text-xs tabular-nums"
                value={schedule.days_ahead}
                onChange={(e) => set({ days_ahead: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={ids.zone} className="text-xs font-medium">
                {isAr ? "التوقيت" : "Time zone"}
              </Label>
              <select
                id={ids.zone}
                className="h-9 w-full max-w-full rounded-md border border-input bg-background px-3 text-xs"
                value={schedule.timezone}
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
            <p id={ids.week} className="text-xs font-medium">
              {isAr ? "أيام العمل" : "Days you work"}
            </p>
            <div role="group" aria-labelledby={ids.week} className="flex flex-wrap gap-2">
              {WEEK.map(({ day, ar, en }) => {
                const on = schedule.weekdays.includes(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    variant="outline"
                    aria-pressed={on}
                    className={chip(on)}
                    onClick={() =>
                      set({
                        weekdays: on
                          ? schedule.weekdays.filter((d) => d !== day)
                          : [...schedule.weekdays, day].sort(),
                      })
                    }
                  >
                    {isAr ? ar : en}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">{isAr ? "أوقات الاستلام" : "Time windows"}</p>
            {typed.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "بلا أوقات، يختار العميل اليوم فقط."
                  : "With no windows, shoppers pick the day only."}
              </p>
            )}
            {typed.map((slot, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2" dir="ltr">
                <Input
                  type="time"
                  aria-label={isAr ? `بداية الوقت ${i + 1}` : `Window ${i + 1} starts`}
                  className="h-9 w-32 text-xs"
                  value={slot.from}
                  onChange={(e) =>
                    set({
                      slots: typed.map((s, j) => (j === i ? { ...s, from: e.target.value } : s)),
                    })
                  }
                />
                <span aria-hidden="true">–</span>
                <Input
                  type="time"
                  aria-label={isAr ? `نهاية الوقت ${i + 1}` : `Window ${i + 1} ends`}
                  className="h-9 w-32 text-xs"
                  value={slot.to}
                  onChange={(e) =>
                    set({
                      slots: typed.map((s, j) => (j === i ? { ...s, to: e.target.value } : s)),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={isAr ? `حذف الوقت ${i + 1}` : `Remove window ${i + 1}`}
                  onClick={() => set({ slots: typed.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
                {!(slot.from < slot.to) && (
                  <span className="text-xs text-destructive" dir="auto">
                    {isAr ? "ينتهي قبل أن يبدأ: لن يُعرض" : "Ends before it starts: not offered"}
                  </span>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={typed.length >= 12}
              onClick={() => {
                const last = typed.at(-1);
                const from = last ? last.to : "10:00";
                const hour = Math.min(23, Number(from.slice(0, 2)) + 4);
                set({
                  slots: [...typed, { from, to: `${String(hour).padStart(2, "0")}:00` }],
                });
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {isAr ? "إضافة وقت" : "Add a window"}
            </Button>
          </div>

          {now && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {preview.length === 0
                ? isAr
                  ? "لا أيام متاحة بهذه الإعدادات؛ لن يُسأل العميل."
                  : "No day is open with these settings; shoppers will not be asked."
                : `${isAr ? "يرى العميل الآن:" : "Shoppers see now:"} ${preview
                    .map(
                      (d) =>
                        dayLabel(d.date, schedule, now, isAr ? "ar" : "en") +
                        (d.slots.length
                          ? ` (${d.slots.map((s) => slotLabel(slotValue(s))).join("، ")})`
                          : ""),
                    )
                    .join(isAr ? "، " : ", ")}`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
