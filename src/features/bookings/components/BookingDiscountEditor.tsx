import { useState } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Booking } from "@/lib/data/bookings";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/** Change or clear a booking's discount by hand (its order follows). */
export function BookingDiscountEditor({
  booking,
  page,
}: {
  booking: Booking;
  page: Pick<BookingsPage, "isAr" | "setDiscount" | "discountPending">;
}) {
  const { isAr } = page;
  const [open, setOpen] = useState(false);
  const current = Number(booking.discount_amount ?? 0);
  const [amount, setAmount] = useState(current > 0 ? String(current) : "");
  const [label, setLabel] = useState(
    (isAr ? booking.discount_label_ar : booking.discount_label_en) ?? "",
  );
  const services = (booking.booking_items ?? []).reduce(
    (sum, item) => sum + Number(item.line_total ?? 0),
    0,
  );
  const value = Number(amount || 0);
  const invalid = !Number.isFinite(value) || value < 0 || value > services;

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Tag className="size-3.5" aria-hidden="true" />
        {current > 0
          ? isAr
            ? "تعديل الخصم"
            : "Change discount"
          : isAr
            ? "إضافة خصم"
            : "Add discount"}
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-muted/30 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        page.setDiscount({ booking, amount: value, label: label.trim() || undefined });
        setOpen(false);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`discount-${booking.id}`} className="text-xs">
            {isAr ? "مبلغ الخصم" : "Discount amount"}
          </Label>
          <Input
            id={`discount-${booking.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.001"
            dir="ltr"
            className="h-9"
            value={amount}
            placeholder="0"
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`discount-label-${booking.id}`} className="text-xs">
            {isAr ? "سبب الخصم (يظهر في الفاتورة)" : "Reason (shown on the invoice)"}
          </Label>
          <Input
            id={`discount-label-${booking.id}`}
            className="h-9"
            maxLength={80}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
      </div>
      {invalid && (
        <p className="text-xs text-destructive" role="alert">
          {isAr
            ? "الخصم لا يتجاوز سعر الخدمات."
            : "A discount can't be more than the services cost."}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className="h-8 text-xs"
          disabled={invalid || page.discountPending}
        >
          {isAr ? "حفظ" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => setOpen(false)}
        >
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        {current > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={page.discountPending}
            onClick={() => {
              page.setDiscount({ booking, amount: 0 });
              setOpen(false);
            }}
          >
            {isAr ? "إزالة الخصم" : "Remove discount"}
          </Button>
        )}
      </div>
    </form>
  );
}
