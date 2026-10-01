import { useState } from "react";
import { Clock, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/bookings/format";
import { durationPriceRows } from "@/features/inventory/lib/duration-pricing";
import type {
  PricingMode,
  ServicePriceRow,
  ServicePricing,
} from "@/features/inventory/lib/service-pricing";

/**
 * A service's prices in its editor: one fixed price, or a price per booking
 * length (with an optional compare-at price), filled by hand or from a base
 * price and an extra-hour price.
 */
export function ServicePricingFields({
  pricing,
  onChange,
  isAr,
  currency,
  error,
}: {
  pricing: ServicePricing;
  onChange: (pricing: ServicePricing) => void;
  isAr: boolean;
  currency: string;
  error?: string | null;
}) {
  const [base, setBase] = useState("");
  const [perHour, setPerHour] = useState("");

  const setMode = (mode: PricingMode) => onChange({ ...pricing, mode });
  const setRow = (minutes: number, patch: Partial<ServicePriceRow>) =>
    onChange({
      ...pricing,
      rows: pricing.rows.map((row) => (row.minutes === minutes ? { ...row, ...patch } : row)),
    });
  const fillFromBase = () => {
    const filled = durationPriceRows({
      lengths: pricing.rows.map((row) => row.minutes),
      basePrice: Number(base) || 0,
      extraHourPrice: Number(perHour) || 0,
      existingMinutes: [],
    });
    onChange({
      ...pricing,
      rows: pricing.rows.map((row) => {
        const price = filled.find((f) => f.minutes === row.minutes)?.price ?? 0;
        return { ...row, enabled: true, price: price > 0 ? String(price) : row.price };
      }),
    });
  };

  const modes: Array<{ id: PricingMode; ar: string; en: string }> = [
    { id: "fixed", ar: "سعر ثابت", en: "Fixed price" },
    { id: "duration", ar: "حسب المدة", en: "By length" },
  ];

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {isAr ? "السعر والمدة" : "Price & length"}
        </Label>
        <div role="group" aria-label={isAr ? "طريقة التسعير" : "Pricing"} className="flex gap-1">
          {modes.map((mode) => (
            <Button
              key={mode.id}
              type="button"
              size="xs"
              variant="chip"
              aria-pressed={pricing.mode === mode.id}
              onClick={() => setMode(mode.id)}
              className={cn(
                "border border-border",
                pricing.mode === mode.id && "border-primary bg-primary/10 text-foreground",
              )}
            >
              {isAr ? mode.ar : mode.en}
            </Button>
          ))}
        </div>
      </div>

      {pricing.mode === "fixed" ? (
        <div className="grid grid-cols-2 gap-2">
          <PriceInput
            label={isAr ? `السعر (${currency})` : `Price (${currency})`}
            value={pricing.fixed.price}
            onChange={(price) => onChange({ ...pricing, fixed: { ...pricing.fixed, price } })}
          />
          <PriceInput
            label={isAr ? "السعر قبل الخصم (اختياري)" : "Compare-at (optional)"}
            value={pricing.fixed.compareAt}
            onChange={(compareAt) =>
              onChange({ ...pricing, fixed: { ...pricing.fixed, compareAt } })
            }
          />
          <p className="col-span-2 text-xs text-muted-foreground">
            {isAr
              ? "نفس السعر لأي مدة يختارها العميل ضمن قواعد الحجز."
              : "The same price for any length the customer books within your booking rules."}
          </p>
        </div>
      ) : pricing.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "اضبط مدد الحجز في قواعد الحجز أولاً، ثم سعّر كل مدة هنا."
            : "Set the booking lengths in your booking rules first, then price each one here."}
        </p>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            {pricing.rows.map((row) => (
              <li
                key={row.minutes}
                className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
              >
                <label className="flex min-w-24 items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={row.enabled}
                    onCheckedChange={(checked) =>
                      setRow(row.minutes, { enabled: checked === true })
                    }
                    aria-label={formatDuration(row.minutes, isAr)}
                  />
                  {formatDuration(row.minutes, isAr)}
                </label>
                <Input
                  inputMode="decimal"
                  dir="ltr"
                  placeholder={isAr ? "السعر" : "Price"}
                  aria-label={`${formatDuration(row.minutes, isAr)}: ${isAr ? "السعر" : "price"}`}
                  disabled={!row.enabled}
                  value={row.price}
                  onChange={(e) => setRow(row.minutes, { price: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  dir="ltr"
                  placeholder={isAr ? "قبل الخصم" : "Compare-at"}
                  aria-label={`${formatDuration(row.minutes, isAr)}: ${isAr ? "السعر قبل الخصم" : "compare-at price"}`}
                  disabled={!row.enabled}
                  value={row.compareAt}
                  onChange={(e) => setRow(row.minutes, { compareAt: e.target.value })}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
            <PriceInput
              label={isAr ? "سعر أقصر مدة" : "Shortest length"}
              value={base}
              onChange={setBase}
            />
            <PriceInput
              label={isAr ? "كل ساعة إضافية" : "Each extra hour"}
              value={perHour}
              onChange={setPerHour}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={fillFromBase}
            >
              <Wand2 className="size-3.5" aria-hidden="true" />
              {isAr ? "تعبئة الأسعار" : "Fill prices"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function PriceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 flex-1 space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Input
        inputMode="decimal"
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
