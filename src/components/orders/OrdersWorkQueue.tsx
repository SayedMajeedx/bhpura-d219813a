import React from "react";
import { Link } from "@tanstack/react-router";
import { formatMoney, formatDate } from "@/lib/format";
import {
  UserX,
  Phone,
  ExternalLink,
  MoreVertical,
  Copy,
  Printer,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrdersWorkQueueProps {
  lang: "en" | "ar";
  slug: string;
  orders: any[];
  isLoading: boolean;
  isError: boolean;
  getPaymentBadge: (order: any) => { label: string; className: string } | null;
  getFulfillmentBadge: (order: any) => { label: string; classes: string } | null;
  renderPrimaryAction: (order: any) => React.ReactNode;
  onCopyInvoice: (orderId: string) => void;
  onPrintThermal: (order: any) => void;
  onWhatsAppCustomer: (order: any) => void;
}

export const OrdersWorkQueue: React.FC<OrdersWorkQueueProps> = ({
  lang,
  slug,
  orders,
  isLoading,
  isError,
  getPaymentBadge,
  getFulfillmentBadge,
  renderPrimaryAction,
  onCopyInvoice,
  onPrintThermal,
  onWhatsAppCustomer,
}) => {
  const isAr = lang === "ar";

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p>{isAr ? "جاري تحميل الطلبات..." : "Loading orders work queue..."}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-xs text-destructive bg-card rounded-xl border border-destructive/20">
        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-80" />
        <p className="font-bold">{isAr ? "تعذر تحميل الطلبات" : "Failed to load orders"}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border/60 space-y-2">
        <p className="font-bold text-sm text-foreground">
          {isAr ? "لا توجد طلبات مطابقة" : "No orders found"}
        </p>
        <p>
          {isAr
            ? "جرب تغيير كلمات البحث أو مسح عوامل التصفية"
            : "Try adjusting search or clearing active filters."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
              <th className="p-3 text-start">{isAr ? "رقم الفاتورة والتاريخ" : "Order & Date"}</th>
              <th className="p-3 text-start">{isAr ? "العميل والتواصل" : "Customer / Contact"}</th>
              <th className="p-3 text-start">{isAr ? "حالة الدفع" : "Payment"}</th>
              <th className="p-3 text-start">{isAr ? "حالة التنفيذ" : "Fulfillment"}</th>
              <th className="p-3 text-end">{isAr ? "الإجمالي" : "Total"}</th>
              <th className="p-3 text-center">{isAr ? "الإجراء التالي" : "Next Action"}</th>
              <th className="p-3 text-center w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {orders.map((order) => {
              const paymentBadge = getPaymentBadge(order);
              const fulfillmentBadge = getFulfillmentBadge(order);
              const customerName = order.customer_name?.trim() || "";
              const customerPhone = order.customer_phone?.trim() || "";
              const isGuest = !customerName;

              return (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors group">
                  {/* Order # & Date */}
                  <td className="p-3 align-middle font-medium">
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug, id: order.id }}
                      className="font-mono font-extrabold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      #{order.invoice_number || order.id.slice(0, 8)}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {formatDate(order.created_at, lang)}
                    </div>
                  </td>

                  {/* Customer / PII */}
                  <td className="p-3 align-middle">
                    {isGuest ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-md">
                        <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                        {isAr ? "عميل زائر" : "Guest Customer"}
                      </span>
                    ) : (
                      <div>
                        <div className="font-bold text-foreground truncate max-w-[180px]">
                          {customerName}
                        </div>
                        {customerPhone && (
                          <a
                            href={`tel:${customerPhone}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary mt-0.5"
                          >
                            <Phone className="h-2.5 w-2.5" />
                            {customerPhone}
                          </a>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Payment Status */}
                  <td className="p-3 align-middle">
                    {paymentBadge && (
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${paymentBadge.className}`}
                      >
                        {paymentBadge.label}
                      </span>
                    )}
                  </td>

                  {/* Fulfillment Status */}
                  <td className="p-3 align-middle">
                    {fulfillmentBadge && (
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${fulfillmentBadge.classes}`}
                      >
                        {fulfillmentBadge.label}
                      </span>
                    )}
                  </td>

                  {/* Total Amount */}
                  <td className="p-3 align-middle text-end font-mono font-extrabold text-foreground">
                    {formatMoney(
                      order.total ?? order.total_amount ?? order.total_price ?? 0,
                      order.currency || "BHD",
                      lang,
                    )}
                  </td>

                  {/* Primary Next Action */}
                  <td className="p-3 align-middle text-center">{renderPrimaryAction(order)}</td>

                  {/* Secondary Actions Menu */}
                  <td className="p-3 align-middle text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          aria-label={isAr ? "خيارات الطلب" : "Order Options"}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isAr ? "start" : "end"} className="w-44 text-xs">
                        <DropdownMenuItem onClick={() => onCopyInvoice(order.id)}>
                          <Copy className="h-3.5 w-3.5 me-2" />
                          {isAr ? "نسخ رابط الفاتورة" : "Copy Invoice Link"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPrintThermal(order)}>
                          <Printer className="h-3.5 w-3.5 me-2" />
                          {isAr ? "طباعة إيصال الحراري" : "Print Receipt"}
                        </DropdownMenuItem>
                        {customerPhone && (
                          <DropdownMenuItem onClick={() => onWhatsAppCustomer(order)}>
                            <MessageSquare className="h-3.5 w-3.5 me-2" />
                            {isAr ? "واتساب العميل" : "WhatsApp Customer"}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
