import React from "react";
import { UserRound, MapPin, Truck, History, Phone, Mail, ExternalLink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getOrderCustomerName,
  getOrderCustomerPhone,
  getOrderCustomerEmail,
} from "@/lib/order-customer-snapshot";
import { formatAddressDetailed } from "@/lib/bahrain-regions";
import { getFulfillmentMethodLabel } from "@/lib/status-labels";
import { ActivityLogList } from "@/components/activity-log-list";
import { cn } from "@/lib/utils";

interface OrderMetaSidePanelProps {
  lang: "en" | "ar";
  order: any;
  customerOnly?: boolean;
  onOpenCustomerModal?: () => void;
  onOpenCourierModal?: () => void;
  children?: React.ReactNode;
}

export const OrderMetaSidePanel: React.FC<OrderMetaSidePanelProps> = ({
  lang,
  order,
  customerOnly = false,
  onOpenCustomerModal,
  onOpenCourierModal,
  children,
}) => {
  const isAr = lang === "ar";

  const customerName = getOrderCustomerName(order) || (isAr ? "عميل زائر" : "Guest Customer");
  const customerPhone = getOrderCustomerPhone(order);
  const customerEmail = getOrderCustomerEmail(order);
  const cleanPhone = (customerPhone || "").replace(/[^\d]/g, "");

  // Address
  const isPickup = order.fulfillment_method === "pickup";
  const customerObj = order.customers || order.customer;
  const addressFormatted = formatAddressDetailed(customerObj, lang);

  return (
    <div className="space-y-4">
      {/* 1. Customer Information Card */}
      <div className="rounded-2xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <UserRound className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground font-display">
              {isAr ? "بيانات العميل" : "Customer Details"}
            </h3>
          </div>

          {onOpenCustomerModal && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenCustomerModal}
              className="h-7 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg"
            >
              {isAr ? "تعديل" : "Edit"}
            </Button>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div>
            <div className="font-extrabold text-sm text-foreground font-display truncate">
              {customerName}
            </div>
          </div>

          {customerPhone && (
            <div className="flex items-center gap-2 text-muted-foreground font-mono">
              <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              <a
                href={`tel:${cleanPhone}`}
                className="hover:text-primary transition-colors truncate"
              >
                {customerPhone}
              </a>
            </div>
          )}

          {customerEmail && (
            <div className="flex items-center gap-2 text-muted-foreground font-mono">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              <a
                href={`mailto:${customerEmail}`}
                className="hover:text-primary transition-colors truncate"
              >
                {customerEmail}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 2. Delivery & Fulfillment Location Card */}
      {!customerOnly && (
        <div className="rounded-2xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <MapPin className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground font-display">
                {isAr ? "التسليم والتوصيل" : "Fulfillment & Delivery"}
              </h3>
            </div>

            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
              {getFulfillmentMethodLabel(order.fulfillment_method, lang)}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {isPickup ? (
              <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 text-muted-foreground font-medium">
                📍 {isAr ? "استلام من الفرع / المحل" : "Pickup from Store"}
              </div>
            ) : addressFormatted ? (
              <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 space-y-1 font-mono">
                <div className="font-bold text-foreground">{addressFormatted}</div>
              </div>
            ) : (
              <div className="text-muted-foreground italic">
                {isAr ? "لم يتم تحديد عنوان توصيل" : "No delivery address specified"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Courier & Logistics Card */}
      {!customerOnly && !isPickup && (
        <div className="rounded-2xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Truck className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground font-display">
                {isAr ? "مندوب التوصيل" : "Courier Logistics"}
              </h3>
            </div>

            {onOpenCourierModal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenCourierModal}
                className="h-7 px-2.5 text-[11px] font-bold rounded-lg border-border/80"
              >
                <Send className="h-3 w-3 me-1 text-emerald-600" />
                {isAr ? "إسناد" : "Dispatch"}
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground font-mono">
            {order.courier_name ? (
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">{order.courier_name}</span>
                {order.courier_phone && <span>{order.courier_phone}</span>}
              </div>
            ) : (
              <div className="italic">
                {isAr ? "لم يتم إسناد مندوب توصيل" : "No courier assigned yet"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Activity Audit Timeline */}
      {!customerOnly && order.id && (
        <div className="rounded-2xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <History className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground font-display">
              {isAr ? "سجل العمليات" : "Activity Log"}
            </h3>
          </div>

          <ActivityLogList orderId={order.id} />
        </div>
      )}

      {children}
    </div>
  );
};
