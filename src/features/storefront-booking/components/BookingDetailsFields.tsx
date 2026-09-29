import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";

/** Step 4: who is booking and where the event is. */
export function BookingDetailsFields({ flow }: { flow: BookingFlow }) {
  const { isAr } = flow;
  const { name, phone, areaCode, venue, notes } = flow.flow;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="booking-name">{isAr ? "الاسم" : "Your name"}</Label>
        <Input
          id="booking-name"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(event) => flow.update({ name: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="booking-phone">{isAr ? "رقم الواتساب" : "WhatsApp number"}</Label>
        <Input
          id="booking-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          maxLength={20}
          value={phone}
          onChange={(event) => flow.update({ phone: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="booking-area">{isAr ? "منطقة المناسبة" : "Event area"}</Label>
        <select
          id="booking-area"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={areaCode}
          onChange={(event) => {
            const region = BAHRAIN_REGIONS.find((r) => r.value === event.target.value);
            flow.update({
              areaCode: region?.value ?? "",
              area: region ? (isAr ? region.ar : region.en) : "",
            });
          }}
        >
          <option value="">{isAr ? "اختر المنطقة" : "Choose an area"}</option>
          {BAHRAIN_REGIONS.map((region) => (
            <option key={region.value} value={region.value}>
              {isAr ? region.ar : region.en}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="booking-venue">{isAr ? "اسم القاعة أو العنوان" : "Venue or address"}</Label>
        <Input
          id="booking-venue"
          maxLength={200}
          value={venue}
          onChange={(event) => flow.update({ venue: event.target.value })}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="booking-notes">{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
        <Textarea
          id="booking-notes"
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(event) => flow.update({ notes: event.target.value })}
          className="resize-none"
        />
      </div>
    </div>
  );
}
