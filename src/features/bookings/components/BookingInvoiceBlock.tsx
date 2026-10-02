import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, FileText, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { dayTitle } from "@/lib/bookings/format";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
import { NO_POLICY, balanceReminder } from "@/lib/bookings/policies";
import type { Booking } from "@/lib/data/bookings";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";
import {
  balanceReminderMessage,
  bookingInvoiceOf,
  invoiceLink,
  invoiceMessage,
  paymentBadge,
  whatsAppToCustomer,
} from "@/features/bookings/lib/booking-invoice";

const TONES = {
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  muted: "bg-muted text-muted-foreground",
} as const;

/**
 * A booking's invoice: its order, with the payment, a link to the order and
 * the public invoice, and the WhatsApp message that sends it. A booking with
 * no order yet can be invoiced with a tap (a request becomes a quote).
 */
export function BookingInvoiceBlock({
  booking,
  page,
}: {
  booking: Booking;
  page: Pick<BookingsPage, "isAr" | "brand" | "createInvoice" | "invoicePending">;
}) {
  const { isAr, brand } = page;
  const invoice = bookingInvoiceOf(booking);
  const [copied, setCopied] = useState(false);
  const policy = useQuery(bookingPoliciesQueries.policy(brand.id)).data;

  if (!invoice) {
    // A card payment still holding the day has its order when it is placed.
    if (booking.status === "hold" || booking.status === "expired") return null;
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={page.invoicePending}
        onClick={() => page.createInvoice(booking)}
      >
        <FileText className="size-3.5" aria-hidden="true" />
        {booking.status === "requested"
          ? isAr
            ? "إنشاء عرض سعر / فاتورة"
            : "Create quote / invoice"
          : isAr
            ? "إنشاء فاتورة"
            : "Create invoice"}
      </Button>
    );
  }

  const link = invoiceLink(window.location.origin, invoice.token);
  const badge = paymentBadge(invoice, isAr);
  const message = invoiceMessage({
    isAr,
    brandName: (isAr ? brand.name_ar : null) || brand.name_en || "",
    customerName: booking.customer_name,
    reference: booking.reference,
    dayLabel: dayTitle(booking.event_date, isAr),
    invoice,
    link,
  });
  const whatsapp = whatsAppToCustomer(booking.customer_phone, message);
  // A confirmed booking with something still to pay can be reminded of the balance.
  const owed =
    booking.status === "confirmed" && invoice.paymentStatus !== "refunded"
      ? balanceReminder(policy ?? NO_POLICY, {
          event_date: booking.event_date,
          total: invoice.total,
          paid: invoice.paid,
        })
      : null;
  const reminder =
    owed &&
    whatsAppToCustomer(
      booking.customer_phone,
      balanceReminderMessage({
        isAr,
        brandName: (isAr ? brand.name_ar : null) || brand.name_en || "",
        customerName: booking.customer_name,
        reference: booking.reference,
        dayLabel: dayTitle(booking.event_date, isAr),
        balance: owed.balance,
        currency: invoice.currency,
        due: owed.due,
        link,
      }),
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(isAr ? "تم نسخ رابط الفاتورة" : "Invoice link copied");
    } catch {
      toast.error(isAr ? "تعذر نسخ الرابط" : "Couldn't copy the link");
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2">
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {isAr ? `فاتورة #${invoice.number}` : `Invoice #${invoice.number}`}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 font-medium", TONES[badge.tone])}>
            {badge.text}
          </span>
          <span className="font-semibold" dir="ltr">
            {formatMoney(invoice.total, invoice.currency)}
          </span>
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Link to="/admin/b/$slug/orders/$id" params={{ slug: brand.slug, id: invoice.orderId }}>
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {isAr ? "فتح الطلب" : "Open order"}
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          onClick={() => void copy()}
        >
          <Copy className="size-3.5" aria-hidden="true" />
          {copied ? (isAr ? "تم النسخ" : "Copied") : isAr ? "نسخ الرابط" : "Copy link"}
        </Button>
        {whatsapp && (
          <Button asChild type="button" size="sm" className="h-8 gap-1.5 text-xs">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-3.5" aria-hidden="true" />
              {isAr ? "إرسال واتساب" : "Send on WhatsApp"}
            </a>
          </Button>
        )}
        {reminder && (
          <Button asChild type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <a href={reminder} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-3.5" aria-hidden="true" />
              {isAr ? "تذكير بالرصيد" : "Remind of balance"}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
