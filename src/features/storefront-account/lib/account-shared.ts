import type { OwnAddress, OwnCustomer } from "@/lib/data/customers";
import { getInvoiceStatusLabel } from "@/lib/status-labels";

// What the account page's sections share: the shapes they read and how an order's state reads.

export type Customer = OwnCustomer;

export type OrderRow = {
  id: string;
  invoice_number: number;
  order_date: string;
  status: string;
  payment_status: string | null;
  fulfillment_status: string | null;
  total: number;
  currency: string;
  public_invoice_token?: string | null;
  order_items: Array<{ id: string; description: string; quantity: number; unit_price: number }>;
};

export type Address = OwnAddress;

export function statusMeta(
  status: string,
  paymentStatus: string | null,
  fulfillmentStatus: string | null,
  isAr: boolean,
) {
  const s = String(status || "").toLowerCase();
  const ful = String(fulfillmentStatus || "").toUpperCase();

  if (s === "cancelled" || ful === "CANCELLED") {
    return {
      label: isAr ? "ملغي" : "Cancelled",
      tone: "bg-red-50 text-red-800 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200/50",
    };
  }

  const effectiveStatus = ful || status;
  const label = getInvoiceStatusLabel(effectiveStatus, isAr ? "ar" : "en");

  let tone = "bg-muted text-muted-foreground border border-border";
  if (ful === "SENT_TO_TAILOR") {
    tone =
      "bg-purple-50 text-purple-800 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-200/50";
  } else if (ful === "RECEIVED_FROM_TAILOR" || ful === "NEEDS_PACKING" || ful === "PACKING") {
    tone =
      "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50";
  } else if (ful === "READY_FOR_PICKUP") {
    tone =
      "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200/50";
  } else if (
    ful === "SHIPPED" ||
    ful === "ASSIGNED" ||
    ful === "OUT_FOR_DELIVERY" ||
    s === "shipped"
  ) {
    tone = "bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-200/50";
  } else if (ful === "COMPLETED" || ful === "DELIVERED" || s === "completed") {
    tone =
      "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50";
  } else {
    tone =
      "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50";
  }

  return { label, tone };
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
