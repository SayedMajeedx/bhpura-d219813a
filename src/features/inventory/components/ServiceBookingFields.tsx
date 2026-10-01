import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  describeServiceBooking,
  serviceBookingRulesOfForm,
  type BookingScope,
  type ServiceBookingForm,
} from "@/lib/bookings/service-capacity";

const SCOPES: Array<{
  id: BookingScope;
  label: { ar: string; en: string };
  hint: { ar: string; en: string };
}> = [
  {
    id: "day",
    label: { ar: "اليوم كاملاً", en: "The whole day" },
    hint: {
      ar: "للفعاليات: الحجز يشغل الخدمة طوال يومه",
      en: "For events: a booking keeps it all day",
    },
  },
  {
    id: "time",
    label: { ar: "ساعاتها فقط", en: "Only its hours" },
    hint: {
      ar: "للمسابح والملاعب والكراسي: يشغل وقته فقط",
      en: "For pools, courts, chairs: only its own time",
    },
  },
];

/** Quick choices for the notice (hours); "" is the store's own lead days. */
const NOTICE_PRESETS: Array<{ value: string; ar: string; en: string }> = [
  { value: "", ar: "حسب المتجر", en: "Store default" },
  { value: "0", ar: "بدون إشعار", en: "No notice" },
  { value: "2", ar: "ساعتان", en: "2 hours" },
  { value: "12", ar: "12 ساعة", en: "12 hours" },
  { value: "24", ar: "يوم", en: "1 day" },
  { value: "48", ar: "يومان", en: "2 days" },
  { value: "72", ar: "3 أيام", en: "3 days" },
];

const BUFFER_PRESETS = ["", "15", "30", "60"];

/**
 * A service's own booking rules in its editor: how many may be booked at once,
 * whether a booking keeps it all day or only its hours (with the setup time
 * between bookings), and the notice it needs. The database enforces them, so
 * the storefront, the admin calendar and checkout all agree.
 */
export function ServiceBookingFields({
  value,
  onChange,
  isAr,
  error,
}: {
  value: ServiceBookingForm;
  onChange: (patch: Partial<ServiceBookingForm>) => void;
  isAr: boolean;
  error?: string | null;
}) {
  const hasCapacity = value.booking_capacity.trim() !== "";
  const summary = describeServiceBooking(serviceBookingRulesOfForm(value), isAr);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-3">
      <div>
        <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {isAr ? "قواعد الحجز لهذه الخدمة" : "Booking rules for this service"}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "حدّد كم حجزاً تقبل في الوقت نفسه، وكم إشعاراً مسبقاً تحتاج."
            : "Say how many bookings you can take at once, and how much notice you need."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="booking-capacity" className="text-xs font-semibold">
          {isAr ? "كم حجزاً في الوقت نفسه؟" : "Bookings at the same time"}
        </Label>
        <Input
          id="booking-capacity"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          dir="ltr"
          className="h-10 max-w-32"
          placeholder={isAr ? "بدون حد" : "No limit"}
          value={value.booking_capacity}
          onChange={(event) => onChange({ booking_capacity: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "مثلاً 2 إن كان عندك فوتوبوثان، أو 1 لمسبح واحد. اتركه فارغاً ليحدّه عدد حجوزات اليوم العام للمتجر."
            : "For example 2 if you have two photo booths, or 1 for one pool. Leave it empty to be limited by the store's daily bookings."}
        </p>
      </div>

      {hasCapacity && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {isAr ? "يُحجز لـ" : "A booking keeps it for"}
            </Label>
            <div
              role="group"
              aria-label={isAr ? "نطاق الحجز" : "Booking scope"}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {SCOPES.map((scope) => {
                const selected = value.booking_scope === scope.id;
                return (
                  <Button
                    key={scope.id}
                    type="button"
                    variant="chip"
                    aria-pressed={selected}
                    onClick={() => onChange({ booking_scope: scope.id })}
                    className={cn(
                      "h-auto w-full min-w-0 flex-col items-start justify-start gap-0.5 whitespace-normal rounded-xl border border-border px-3 py-2.5 text-start",
                      selected &&
                        "border-primary bg-primary/10 text-foreground hover:bg-primary/10",
                    )}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {isAr ? scope.label.ar : scope.label.en}
                    </span>
                    <span className="w-full break-words text-xs text-muted-foreground">
                      {isAr ? scope.hint.ar : scope.hint.en}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          {value.booking_scope === "time" && (
            <div className="space-y-1.5">
              <Label htmlFor="booking-buffer" className="text-xs font-semibold">
                {isAr
                  ? "وقت التجهيز والتنظيف بين الحجوزات (دقيقة)"
                  : "Setup / clean-up between bookings (minutes)"}
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {BUFFER_PRESETS.map((preset) => (
                  <Button
                    key={preset || "none"}
                    type="button"
                    size="xs"
                    variant="chip"
                    aria-pressed={value.booking_buffer_minutes === preset}
                    onClick={() => onChange({ booking_buffer_minutes: preset })}
                    className={cn(
                      "border border-border",
                      value.booking_buffer_minutes === preset &&
                        "border-primary bg-primary/10 text-foreground",
                    )}
                  >
                    {preset === "" ? (isAr ? "بدون" : "None") : preset}
                  </Button>
                ))}
                <Input
                  id="booking-buffer"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={480}
                  dir="ltr"
                  className="h-8 w-24"
                  value={value.booking_buffer_minutes}
                  onChange={(event) => onChange({ booking_buffer_minutes: event.target.value })}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="booking-notice" className="text-xs font-semibold">
          {isAr ? "الإشعار المسبق قبل الحجز" : "Notice needed before a booking"}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {NOTICE_PRESETS.map((preset) => (
            <Button
              key={preset.value || "default"}
              type="button"
              size="xs"
              variant="chip"
              aria-pressed={value.booking_notice_hours === preset.value}
              onClick={() => onChange({ booking_notice_hours: preset.value })}
              className={cn(
                "border border-border",
                value.booking_notice_hours === preset.value &&
                  "border-primary bg-primary/10 text-foreground",
              )}
            >
              {isAr ? preset.ar : preset.en}
            </Button>
          ))}
          <Input
            id="booking-notice"
            type="number"
            inputMode="numeric"
            min={0}
            max={8760}
            dir="ltr"
            className="h-8 w-24"
            placeholder={isAr ? "ساعات" : "hours"}
            value={value.booking_notice_hours}
            onChange={(event) => onChange({ booking_notice_hours: event.target.value })}
          />
        </div>
      </div>

      {summary.length > 0 && (
        <p className="rounded-lg bg-background px-3 py-2 text-xs text-foreground">
          {summary.join(" · ")}
        </p>
      )}
      {error && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
