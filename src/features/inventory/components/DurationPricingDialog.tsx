import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { bookingsQueries } from "@/lib/data/bookings";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { createVariants } from "@/lib/data/catalog";
import { durations } from "@/lib/bookings/rules";
import { formatDuration } from "@/lib/bookings/format";
import type { Variant } from "@/features/inventory/types";
import { durationPriceRows, durationVariants } from "@/features/inventory/lib/duration-pricing";

/**
 * A bookings store prices a service by how long it is booked: a base price
 * for the shortest booking and a price per extra hour make one variant per
 * length the store offers.
 */
export function DurationPricingDialog({
  productId,
  variants,
  onChanged,
}: {
  productId: string;
  variants: readonly Variant[];
  onChanged: () => void;
}) {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { profile } = useAdminStoreProfile(brand.id);
  const rules = useQuery(bookingsQueries.settings(brand.id)).data;
  const currency = useQuery(businessSettingsQueries.detail(brand.id)).data?.currency ?? "BHD";
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");
  const [perHour, setPerHour] = useState("");
  const [saving, setSaving] = useState(false);

  if (!profile.modules.bookings || !rules) return null;

  const existingMinutes = variants
    .map((variant) => (variant as Variant & { duration_minutes?: number | null }).duration_minutes)
    .filter((minutes): minutes is number => typeof minutes === "number");
  const rows = durationPriceRows({
    lengths: durations(rules),
    basePrice: Number(base) || 0,
    extraHourPrice: Number(perHour) || 0,
    existingMinutes,
  });
  const toCreate = durationVariants(productId, rows, isAr);
  const valid = base.trim() !== "" && Number(base) >= 0 && Number(perHour || 0) >= 0;

  const save = async () => {
    setSaving(true);
    try {
      await createVariants(brand.id, toCreate);
      toast.success(isAr ? "تمت إضافة أسعار المدد" : "Duration prices added");
      setOpen(false);
      onChanged();
    } catch {
      toast.error(isAr ? "تعذّر إضافة الأسعار." : "Could not add the prices.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 rounded-xl px-3.5 text-xs font-bold"
        onClick={() => setOpen(true)}
      >
        <Clock className="size-3.5" aria-hidden="true" />
        {isAr ? "السعر حسب المدة" : "Price by duration"}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{isAr ? "السعر حسب المدة" : "Price by duration"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "سعر لأقصر مدة وسعر لكل ساعة إضافية؛ يُضاف سعر لكل مدة تعرضها في الحجز."
                : "A price for the shortest booking and each extra hour; one price per length you offer."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="space-y-1">
              <Label htmlFor="duration-base">
                {isAr
                  ? `سعر ${formatDuration(rules.min_duration_minutes, true)}`
                  : `Price for ${formatDuration(rules.min_duration_minutes, false)}`}
              </Label>
              <Input
                id="duration-base"
                type="number"
                min={0}
                step="0.001"
                dir="ltr"
                value={base}
                onChange={(event) => setBase(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="duration-extra">{isAr ? "كل ساعة إضافية" : "Each extra hour"}</Label>
              <Input
                id="duration-extra"
                type="number"
                min={0}
                step="0.001"
                dir="ltr"
                value={perHour}
                onChange={(event) => setPerHour(event.target.value)}
              />
            </div>
          </div>
          <ul className="space-y-1 rounded-lg border border-border p-2 text-sm">
            {rows.map((row) => (
              <li key={row.minutes} className="flex justify-between gap-2">
                <span>{formatDuration(row.minutes, isAr)}</span>
                <span className="text-muted-foreground" dir="ltr">
                  {row.exists ? (isAr ? "موجود" : "already set") : formatMoney(row.price, currency)}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={!valid || toCreate.length === 0 || saving}
            >
              {isAr ? `إضافة ${toCreate.length} سعر` : `Add ${toCreate.length} prices`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
