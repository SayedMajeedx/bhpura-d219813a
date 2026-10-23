import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import type { Booking } from "@/lib/data/bookings";
import { cancelMoney, donePlan, shownStatus } from "@/features/bookings/lib/booking-actions";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/**
 * The two steps on a booking that ask first: marking it done (which completes
 * its order and records what the customer still owed as collected) and
 * cancelling it (which cancels its order too, with a reason kept on the
 * booking, and says that money already paid is the store's to return).
 */

type DialogProps = {
  page: BookingsPage;
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BookingDoneDialog({ page, booking, open, onOpenChange }: DialogProps) {
  const { isAr } = page;
  const lang = isAr ? "ar" : "en";
  const plan = donePlan(booking);
  const who = booking.customer_name || (isAr ? "العميل" : "The customer");
  const owed =
    plan.kind === "order" && plan.collect > 0
      ? formatMoney(plan.collect, plan.currency, lang)
      : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAr ? "تم تنفيذ الخدمة؟" : "Mark the service done?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {plan.kind === "verify_first"
              ? isAr
                ? "إيصال تحويل لهذا الحجز بانتظار تحققك. أكّد الدفع على طلبه أولاً."
                : "A transfer receipt for this booking waits for your check. Approve the payment on its order first."
              : owed
                ? isAr
                  ? `على ${who} مبلغ ${owed}. الإتمام يسجّله محصَّلاً، ويُتم الحجز وفاتورته.`
                  : `${who} still owes ${owed}. Completing records it as collected, and completes the booking and its invoice.`
                : plan.kind === "order"
                  ? isAr
                    ? "يُتم الحجز وفاتورته."
                    : "The booking and its invoice are completed."
                  : isAr
                    ? "يُسجَّل الحجز منتهياً."
                    : "The booking is marked done."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{isAr ? "رجوع" : "Back"}</AlertDialogCancel>
          {plan.kind === "verify_first" ? (
            <Button asChild>
              <Link
                to="/admin/b/$slug/orders/$id"
                params={{ slug: page.brand.slug, id: plan.orderId }}
              >
                {isAr ? "راجع الإيصال" : "Review the receipt"}
              </Link>
            </Button>
          ) : (
            <AlertDialogAction
              disabled={page.statusPending}
              onClick={() => page.completeBooking(booking)}
            >
              {owed
                ? isAr
                  ? `تحصيل ${owed} وإتمام`
                  : `Collect ${owed} & complete`
                : isAr
                  ? "تم تنفيذ الخدمة"
                  : "Service done"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The words of a cancel, by what is being let go: a request, a held day, or a booking. */
function cancelWords(status: string, isAr: boolean) {
  if (status === "requested") {
    return isAr
      ? { title: "رفض طلب الحجز؟", action: "رفض الطلب", keep: "إبقاء الطلب" }
      : { title: "Decline this request?", action: "Decline", keep: "Keep the request" };
  }
  if (status === "hold" || status === "expired") {
    return isAr
      ? { title: "تحرير الموعد؟", action: "تحرير الموعد", keep: "رجوع" }
      : { title: "Release the day?", action: "Release the day", keep: "Back" };
  }
  return isAr
    ? { title: "إلغاء الحجز؟", action: "إلغاء الحجز", keep: "إبقاء الحجز" }
    : { title: "Cancel this booking?", action: "Cancel booking", keep: "Keep the booking" };
}

export function BookingCancelDialog({ page, booking, open, onOpenChange }: DialogProps) {
  const { isAr } = page;
  const lang = isAr ? "ar" : "en";
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const words = cancelWords(shownStatus(booking), isAr);
  const money = cancelMoney(booking);
  const paid =
    money.paid > 0 ? formatMoney(money.paid, money.currency ?? page.currency, lang) : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{words.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {money.hasOrder
              ? isAr
                ? "تُلغى فاتورته معه، ويعود اليوم متاحاً للحجز."
                : "Its invoice is cancelled with it, and the day opens for booking again."
              : isAr
                ? "يعود اليوم متاحاً للحجز."
                : "The day opens for booking again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {paid && (
          <p className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-foreground">
            {isAr
              ? `دفع العميل ${paid}. الإلغاء لا يعيده: أرجعه له بنفسك كما تنص شروط الحجز.`
              : `The customer has paid ${paid}. Cancelling does not return it: refund it yourself, as your booking terms say.`}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>{isAr ? "السبب (اختياري)" : "Reason (optional)"}</Label>
          <Textarea
            id={reasonId}
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "يُحفظ مع الحجز لفريقك، ولا يُرسل للعميل."
              : "Kept on the booking for your team; the customer is not sent it."}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{words.keep}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={page.statusPending}
            onClick={() =>
              page.setStatus({ booking, status: "cancelled", reason: reason.trim() || undefined })
            }
          >
            {words.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
