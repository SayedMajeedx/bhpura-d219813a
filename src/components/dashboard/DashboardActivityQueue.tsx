import React from "react";
import { ExternalLink, ReceiptText, Calendar, User } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { formatMoney, formatDate } from "@/lib/format";
import { getDashboardOrderStatus } from "@/lib/dashboard-order-status";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";
import { OsStatusPill } from "@/components/os/os-status-pill";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useOrderNumber } from "@/hooks/use-order-number";

interface RecentOrder {
  id: string;
  invoice_number: number | string;
  created_at: string;
  currency: string;
  total: number;
  status: string;
  fulfillment_status?: string | null;
  fulfillment_method?: string | null;
  payment_status: string;
  customer_name_snapshot?: string | null;
  customer_email_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  customers?: { name: string } | null;
  payment_method?: string | null;
}

interface DashboardActivityQueueProps {
  lang: "ar" | "en";
  slug: string;
  orders: RecentOrder[];
  currency: string;
  locale: string;
}

export const DashboardActivityQueue = React.memo(function DashboardActivityQueue({
  lang,
  slug,
  orders,
  currency,
  locale,
}: DashboardActivityQueueProps) {
  const isAr = lang === "ar";
  const orderNo = useOrderNumber();
  const { vocabulary } = useVocabulary();

  if (orders.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground border-dashed rounded-2xl">
        <ReceiptText className="h-8 w-8 mx-auto mb-2 opacity-50 text-muted-foreground" />
        <p className="text-xs font-semibold">
          {isAr ? "لا توجد طلبات حديثة مسجلة" : "No recent orders logged yet"}
        </p>
      </Card>
    );
  }

  return (
    // Table or cards by the box's own width, not the screen's: on a laptop the list sits in two
    // fifths of the row beside the chart, where six columns were cut off by the card's edge.
    <div className="@container space-y-3">
      {/* A wide box: the table. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm @2xl:block">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
              <th className="py-3 px-4 text-start">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
              <th className="py-3 px-4 text-start">{isAr ? "التاريخ والوقت" : "Date & Time"}</th>
              <th className="py-3 px-4 text-start">{isAr ? "العميل" : "Customer"}</th>
              <th className="py-3 px-4 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="py-3 px-4 text-end">{isAr ? "الإجمالي" : "Total"}</th>
              <th className="py-3 px-4 text-center">{isAr ? "عرض" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {orders.map((o) => {
              const custName = getOrderCustomerName(o) || (isAr ? "عميل جديد" : "Guest Customer");
              const displayStatus = getDashboardOrderStatus(o, lang, vocabulary);

              return (
                <tr
                  key={o.id}
                  className="transition-colors hover:bg-muted/20 text-foreground font-medium"
                >
                  <td className="py-3 px-4 font-mono font-bold text-primary">
                    {orderNo(o.invoice_number)}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground font-mono">
                    {formatDate(o.created_at, locale)}
                  </td>
                  <td
                    dir="auto"
                    className="text-page-start py-3 px-4 font-semibold text-foreground break-words"
                  >
                    {custName}
                  </td>
                  <td className="py-3 px-4">
                    <OsStatusPill variant={displayStatus.variant} dot>
                      {displayStatus.label}
                    </OsStatusPill>
                  </td>
                  <td className="py-3 px-4 text-end font-bold tabular-nums text-foreground">
                    {formatMoney(Number(o.total || 0), o.currency || currency, locale)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug, id: o.id }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      <span>{isAr ? "تفاصيل" : "View"}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A narrow box (a phone, or beside the chart): a card per order. */}
      <div className="grid grid-cols-1 gap-2.5 @2xl:hidden">
        {orders.map((o) => {
          const custName = getOrderCustomerName(o) || (isAr ? "عميل جديد" : "Guest Customer");
          const displayStatus = getDashboardOrderStatus(o, lang, vocabulary);

          return (
            <Card
              key={o.id}
              className="p-3.5 border border-border bg-card rounded-2xl space-y-2 shadow-2xs"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 font-mono font-bold text-xs text-primary">
                  {orderNo(o.invoice_number)}
                </span>
                <OsStatusPill variant={displayStatus.variant} dot>
                  {displayStatus.label}
                </OsStatusPill>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-border-subtle">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-foreground flex min-w-0 items-center gap-1">
                    <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span dir="auto" className="text-page-start line-clamp-2 min-w-0 break-words">
                      {custName}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                    <Calendar className="h-2.5 w-2.5" /> {formatDate(o.created_at, locale)}
                  </p>
                </div>

                <div className="shrink-0 text-end">
                  <p className="font-bold text-sm tabular-nums text-foreground">
                    {formatMoney(Number(o.total || 0), o.currency || currency, locale)}
                  </p>
                  <Link
                    to="/admin/b/$slug/orders/$id"
                    params={{ slug, id: o.id }}
                    className="inline-flex items-center gap-0.5 text-xs font-bold text-primary hover:underline mt-0.5"
                  >
                    <span>{isAr ? "عرض الطلب" : "View"}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
});
