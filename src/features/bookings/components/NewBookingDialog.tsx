import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { catalogQueries } from "@/lib/data/catalog";
import { bookingErrorMessage, createStaffBooking } from "@/lib/data/bookings";
import { durations, startTimes } from "@/lib/bookings/rules";
import { dayTitle, formatClock, formatDuration } from "@/features/bookings/lib/calendar-view";
import {
  bookingLines,
  bookingTotal,
  formProblems,
  listedPrice,
  toStaffBooking,
  type NewBookingForm,
} from "@/features/bookings/lib/new-booking";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

const PROBLEM_TEXT = {
  day: { ar: "اختر التاريخ.", en: "Choose a date." },
  slot: { ar: "اختر وقت بداية ومدة متاحين.", en: "Choose an offered start time and duration." },
  services: { ar: "اختر خدمة واحدة على الأقل.", en: "Choose at least one service." },
  customer: { ar: "أدخل اسم العميل أو رقمه.", en: "Enter the customer's name or phone." },
  price: { ar: "تحقق من الأسعار والكميات.", en: "Check the prices and quantities." },
} as const;

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A booking staff take themselves (phone, WhatsApp, in person) for the chosen day. */
export function NewBookingDialog({
  page,
  open,
  onOpenChange,
}: {
  page: BookingsPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAr, rules, brand, currency } = page;
  const lang = isAr ? "ar" : "en";
  const products = useQuery(catalogQueries.products(brand.id)).data;
  const services = useMemo(() => (products ?? []).filter((p) => p.is_active), [products]);
  const times = startTimes(rules);
  const lengths = durations(rules);

  const [form, setForm] = useState<NewBookingForm>(() => ({
    day: page.selectedDay,
    start: times.includes("18:00") ? "18:00" : times[0],
    durationMinutes: lengths[0],
    customerName: "",
    customerPhone: "",
    area: "",
    venue: "",
    notes: "",
    status: "confirmed",
    source: "admin",
    allowOverbook: false,
    services: {},
  }));
  const set = <K extends keyof NewBookingForm>(key: K, value: NewBookingForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const lines = bookingLines(form.services, services);
  const problems = formProblems(form, rules, lines);
  const dayFull =
    page.selectedCell?.day === form.day &&
    page.selectedCell.state !== "available" &&
    form.status === "confirmed";

  const save = useMutation({
    mutationFn: () => createStaffBooking(toStaffBooking(brand.id, form, lines)),
    onSuccess: async () => {
      await page.refresh();
      toast.success(isAr ? "تم حفظ الحجز" : "Booking saved");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(bookingErrorMessage(error.message, isAr)),
  });

  const toggleService = (productId: string, price: number, on: boolean) =>
    setForm((current) => {
      const next = { ...current.services };
      if (on) next[productId] = { quantity: 1, unit_price: price };
      else delete next[productId];
      return { ...current, services: next };
    });
  const setService = (
    productId: string,
    patch: Partial<{ quantity: number; unit_price: number }>,
  ) =>
    setForm((current) => ({
      ...current,
      services: {
        ...current.services,
        [productId]: { ...current.services[productId], ...patch },
      },
    }));

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{isAr ? "حجز جديد" : "New booking"}</DialogTitle>
          <DialogDescription>{dayTitle(form.day, isAr)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="booking-day">{isAr ? "التاريخ" : "Date"}</Label>
              <Input
                id="booking-day"
                type="date"
                value={form.day}
                onChange={(event) => set("day", event.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-start">{isAr ? "البداية" : "Start"}</Label>
              <select
                id="booking-start"
                className={SELECT_CLASS}
                value={form.start}
                onChange={(event) => set("start", event.target.value)}
              >
                {times.map((time) => (
                  <option key={time} value={time}>
                    {formatClock(time, isAr)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-duration">{isAr ? "المدة" : "Duration"}</Label>
              <select
                id="booking-duration"
                className={SELECT_CLASS}
                value={form.durationMinutes}
                onChange={(event) => set("durationMinutes", Number(event.target.value))}
              >
                {lengths.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes, isAr)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="font-semibold text-foreground">
              {isAr ? "الخدمات" : "Services"}
            </legend>
            {services.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {isAr ? "أضف خدماتك في الكتالوج أولاً." : "Add your services to the catalog first."}
              </p>
            )}
            {services.map((product) => {
              const chosen = form.services[product.id];
              const name = (isAr ? product.name_ar : product.name_en) || product.name;
              return (
                <div key={product.id} className="rounded-lg border border-border p-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={Boolean(chosen)}
                      onCheckedChange={(checked) =>
                        toggleService(product.id, listedPrice(product), Boolean(checked))
                      }
                    />
                    <span className="flex-1">{name}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {formatMoney(listedPrice(product), currency)}
                    </span>
                  </label>
                  {chosen && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        aria-label={isAr ? `كمية ${name}` : `${name} quantity`}
                        value={chosen.quantity}
                        onChange={(event) =>
                          setService(product.id, { quantity: Number(event.target.value) })
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        aria-label={isAr ? `سعر ${name}` : `${name} price`}
                        value={chosen.unit_price}
                        onChange={(event) =>
                          setService(product.id, { unit_price: Number(event.target.value) })
                        }
                        dir="ltr"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="booking-customer">{isAr ? "اسم العميل" : "Customer name"}</Label>
              <Input
                id="booking-customer"
                value={form.customerName}
                onChange={(event) => set("customerName", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-phone">{isAr ? "رقم الهاتف" : "Phone"}</Label>
              <Input
                id="booking-phone"
                type="tel"
                dir="ltr"
                value={form.customerPhone}
                onChange={(event) => set("customerPhone", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-area">{isAr ? "المنطقة" : "Area"}</Label>
              <Input
                id="booking-area"
                value={form.area}
                onChange={(event) => set("area", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-venue">
                {isAr ? "القاعة أو العنوان" : "Venue or address"}
              </Label>
              <Input
                id="booking-venue"
                value={form.venue}
                onChange={(event) => set("venue", event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="booking-notes">{isAr ? "ملاحظات" : "Notes"}</Label>
            <Textarea
              id="booking-notes"
              rows={2}
              maxLength={2000}
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="booking-status">{isAr ? "الحالة" : "Status"}</Label>
              <select
                id="booking-status"
                className={SELECT_CLASS}
                value={form.status}
                onChange={(event) => set("status", event.target.value as NewBookingForm["status"])}
              >
                <option value="confirmed">
                  {isAr ? "مؤكد (يحجز اليوم)" : "Confirmed (takes the day)"}
                </option>
                <option value="requested">
                  {isAr ? "طلب بانتظار التأكيد" : "Request, to confirm later"}
                </option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-source">{isAr ? "المصدر" : "Came through"}</Label>
              <select
                id="booking-source"
                className={SELECT_CLASS}
                value={form.source}
                onChange={(event) => set("source", event.target.value as NewBookingForm["source"])}
              >
                <option value="admin">{isAr ? "هاتف أو حضوري" : "Phone or in person"}</option>
                <option value="whatsapp">{isAr ? "واتساب" : "WhatsApp"}</option>
              </select>
            </div>
          </div>

          {dayFull && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-warning bg-warning-subtle p-2 text-xs">
              <Checkbox
                checked={form.allowOverbook}
                onCheckedChange={(checked) => set("allowOverbook", Boolean(checked))}
                className="mt-0.5"
              />
              <span>
                {isAr
                  ? "هذا اليوم غير متاح. احجز رغم ذلك (قرار المتجر)."
                  : "This day is not available. Book it anyway (the store's call)."}
              </span>
            </label>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3 font-semibold">
            <span>{isAr ? "الإجمالي" : "Total"}</span>
            <span dir="ltr">{formatMoney(bookingTotal(lines), currency)}</span>
          </div>
          {problems.length > 0 && (
            <p className="text-xs text-muted-foreground" role="status">
              {PROBLEM_TEXT[problems[0]][lang]}
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
            disabled={problems.length > 0 || save.isPending}
          >
            {save.isPending
              ? isAr
                ? "جارٍ الحفظ…"
                : "Saving…"
              : isAr
                ? "حفظ الحجز"
                : "Save booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
