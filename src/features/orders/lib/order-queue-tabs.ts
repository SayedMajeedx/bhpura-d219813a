import { CheckCircle2, CircleDollarSign, Clock3, Package, ReceiptText, Truck } from "lucide-react";
import type { orderTabCounts } from "@/features/orders/lib/order-queue";

/** The orders list quick tabs, in display order, with their counts. */
export function orderQueueTabs(counts: ReturnType<typeof orderTabCounts>) {
  return [
    {
      id: "action_required",
      label_en: "Needs attention",
      label_ar: "يحتاج متابعة",
      count: counts.action_required,
      icon: Clock3,
    },
    {
      id: "unpaid",
      label_en: "Awaiting payment",
      label_ar: "بانتظار الدفع",
      count: counts.unpaid,
      icon: CircleDollarSign,
    },
    {
      id: "to_prepare",
      label_en: "To prepare",
      label_ar: "قيد التجهيز",
      count: counts.to_prepare,
      icon: Package,
    },
    {
      id: "shipped",
      label_en: "With courier",
      label_ar: "مع المندوب",
      count: counts.shipped,
      icon: Truck,
    },
    {
      id: "completed",
      label_en: "Completed",
      label_ar: "مكتملة",
      count: counts.completed,
      icon: CheckCircle2,
    },
    {
      id: "all",
      label_en: "All orders",
      label_ar: "كل الطلبات",
      count: counts.all,
      icon: ReceiptText,
    },
  ] as const;
}
