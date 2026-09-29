import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBookingSettings } from "@/lib/data/bookings";
import { minutesOf, type BookingRules } from "@/lib/bookings/rules";
import { weekdayNames } from "@/lib/bookings/format";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/** What is wrong with a set of rules before the database would refuse them. */
export function rulesProblem(rules: BookingRules, isAr: boolean): string | null {
  if (rules.daily_capacity < 1 || rules.daily_capacity > 100) {
    return isAr ? "عدد الحجوزات في اليوم بين 1 و100." : "Bookings per day must be 1 to 100.";
  }
  if (minutesOf(rules.last_start_time) < minutesOf(rules.open_time)) {
    return isAr
      ? "آخر بداية يجب أن تكون بعد أول بداية."
      : "The last start must be after the first.";
  }
  if (rules.max_duration_minutes < rules.min_duration_minutes) {
    return isAr ? "أطول مدة يجب ألا تقل عن أقصر مدة." : "The longest duration can't be shorter.";
  }
  if (rules.lead_days < 0 || rules.horizon_days < 1 || rules.horizon_days > 730) {
    return isAr ? "تحقق من مهلة الحجز والمدى." : "Check the notice period and how far ahead.";
  }
  return null;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24];

/** The store's booking rules: when it takes bookings, for how long, and how many a day. */
export function BookingRulesDialog({
  page,
  open,
  onOpenChange,
}: {
  page: BookingsPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAr, brand } = page;
  const [rules, setRules] = useState<BookingRules>(page.rules);
  const set = <K extends keyof BookingRules>(key: K, value: BookingRules[K]) =>
    setRules((current) => ({ ...current, [key]: value }));
  const problem = rulesProblem(rules, isAr);

  const save = useMutation({
    mutationFn: () => saveBookingSettings(brand.id, rules),
    onSuccess: async () => {
      await page.refresh();
      toast.success(isAr ? "تم حفظ قواعد الحجز" : "Booking rules saved");
      onOpenChange(false);
    },
    onError: () => toast.error(isAr ? "تعذّر حفظ القواعد." : "Could not save the rules."),
  });

  const number = (
    key: "daily_capacity" | "lead_days" | "horizon_days",
    label: string,
    min: number,
    max: number,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`rules-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`rules-${key}`}
        type="number"
        min={min}
        max={max}
        dir="ltr"
        value={rules[key]}
        onChange={(event) => set(key, Number(event.target.value))}
      />
    </div>
  );
  const hours = (key: "min_duration_minutes" | "max_duration_minutes", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`rules-${key}`} className="text-xs">
        {label}
      </Label>
      <select
        id={`rules-${key}`}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={rules[key]}
        onChange={(event) => set(key, Number(event.target.value))}
      >
        {HOURS.map((h) => (
          <option key={h} value={h * 60}>
            {isAr ? `${h} ساعة` : `${h} h`}
          </option>
        ))}
      </select>
    </div>
  );
  const time = (key: "open_time" | "last_start_time", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`rules-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`rules-${key}`}
        type="time"
        step={rules.slot_minutes * 60}
        dir="ltr"
        value={rules[key]}
        onChange={(event) => set(key, event.target.value.slice(0, 5))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{isAr ? "قواعد الحجز" : "Booking rules"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "يطبّقها التقويم في متجرك والنظام عند كل حجز."
              : "Your storefront calendar and every booking follow these."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            {number("daily_capacity", isAr ? "عدد الحجوزات في اليوم" : "Bookings per day", 1, 100)}
            <div className="space-y-1">
              <Label htmlFor="rules-slot" className="text-xs">
                {isAr ? "فواصل أوقات البداية" : "Start times every"}
              </Label>
              <select
                id="rules-slot"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={rules.slot_minutes}
                onChange={(event) => set("slot_minutes", Number(event.target.value))}
              >
                {[15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {isAr ? `${m} دقيقة` : `${m} min`}
                  </option>
                ))}
              </select>
            </div>
            {time("open_time", isAr ? "أول وقت بداية" : "First start")}
            {time("last_start_time", isAr ? "آخر وقت بداية" : "Last start")}
            {hours("min_duration_minutes", isAr ? "أقصر مدة" : "Shortest booking")}
            {hours("max_duration_minutes", isAr ? "أطول مدة" : "Longest booking")}
            {number(
              "lead_days",
              isAr ? "أقل مهلة قبل الحجز (أيام)" : "Notice needed (days)",
              0,
              365,
            )}
            {number(
              "horizon_days",
              isAr ? "الحجز متاح حتى (أيام)" : "Bookable up to (days ahead)",
              1,
              730,
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-foreground">
              {isAr ? "أيام العطلة الأسبوعية" : "Closed every week on"}
            </legend>
            <div className="flex flex-wrap gap-2">
              {weekdayNames(isAr, 0).map((name, weekday) => (
                <label
                  key={name}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs"
                >
                  <Checkbox
                    checked={rules.closed_weekdays.includes(weekday)}
                    onCheckedChange={(checked) =>
                      set(
                        "closed_weekdays",
                        checked
                          ? [...rules.closed_weekdays, weekday].sort((x, y) => x - y)
                          : rules.closed_weekdays.filter((d) => d !== weekday),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
          </fieldset>

          {problem && (
            <p className="text-xs text-destructive" role="alert">
              {problem}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={Boolean(problem) || save.isPending}
          >
            {isAr ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
