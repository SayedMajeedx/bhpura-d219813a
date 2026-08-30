import React from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Save,
  Printer,
  Receipt,
  Link as LinkIcon,
  Unlock,
  MoreHorizontal,
  Loader2,
  Lock,
  ChevronDown,
  Check,
  Scissors,
  PackageCheck,
  Box,
  Store,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { getOrderTypeLabel, detectOrderType } from "@/lib/order-type-detector";
import { getFulfillmentLabel, getFulfillmentBadgeClasses } from "@/lib/status-labels";
import {
  PAYMENT_BADGE_CLASSES,
  formatPaymentBadgeDetail,
  type PaymentBadge,
} from "@/lib/payment-status";
import { cn } from "@/lib/utils";

interface OrderUnifiedHeaderProps {
  lang: "en" | "ar";
  slug: string;
  order: any;
  items: any[];
  totals?: {
    subtotal?: number;
    discount?: number;
    shipping?: number;
    taxAmount?: number;
    total?: number;
    advancePaid?: number;
    remaining?: number;
  };
  isCreationMode: boolean;
  isReadOnly: boolean;
  isAdmin: boolean;
  isDirty: boolean;
  saving: boolean;
  paymentBadge: PaymentBadge;
  onSave: () => void;
  onUnlock: () => void;
  onPrintReceipt: () => void;
  onPrintA4: () => void;
  onCopyLink: () => void;
  onOpenPaymentModal?: () => void;
  onUpdateOrderStatus?: (status: string, fulfillmentStatus: string) => Promise<void> | void;
  renderPrimaryAction: () => React.ReactNode;
  children?: React.ReactNode;
}

export const OrderUnifiedHeader: React.FC<OrderUnifiedHeaderProps> = ({
  lang,
  slug,
  order,
  items,
  totals,
  isCreationMode,
  isReadOnly,
  isAdmin,
  isDirty,
  saving,
  paymentBadge,
  onSave,
  onUnlock,
  onPrintReceipt,
  onPrintA4,
  onCopyLink,
  onOpenPaymentModal,
  onUpdateOrderStatus,
  renderPrimaryAction,
  children,
}) => {
  const router = useRouter();
  const isAr = lang === "ar";

  const orderType = detectOrderType(items, order?.order_type);
  const orderTypeLabel = getOrderTypeLabel(orderType, lang);

  return (
    <header className="no-print space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-2xs sm:p-4">
        {/* Left: Back Arrow + Order # + Badges */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (window.history.length > 2) {
                router.history.back();
              } else {
                router.navigate({ to: `/admin/b/${slug}/orders` });
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0 touch-manipulation"
            aria-label={isAr ? "العودة للطلبات" : "Back to orders"}
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-lg sm:text-2xl font-extrabold tracking-tight text-foreground font-mono">
                {isCreationMode
                  ? isAr
                    ? "طلب جديد"
                    : "New Order"
                  : `${isAr ? "الطلب" : "Order"} #${order.invoice_number ?? order.id?.slice(0, 8)}`}
              </h1>

              {!isCreationMode && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary border border-primary/20">
                  {orderTypeLabel}
                </span>
              )}
            </div>

            {!isCreationMode && (
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                {formatDate(order.created_at ?? order.order_date, isAr ? "ar-BH" : "en-BH")}
              </p>
            )}
          </div>

          {/* Micro-Pills Status Group */}
          {!isCreationMode && (
            <div className="flex items-center gap-1.5 flex-wrap ms-1 sm:ms-3 border-s border-border/60 ps-2.5 sm:ps-3">
              <button
                type="button"
                onClick={onOpenPaymentModal}
                disabled={!onOpenPaymentModal}
                title={isAr ? "انقر لإدارة حالة وسجل الدفع" : "Click to manage payment lifecycle"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-tight transition-all hover:opacity-90 touch-manipulation focus-visible:ring-2 focus-visible:ring-ring",
                  PAYMENT_BADGE_CLASSES[paymentBadge],
                )}
              >
                <span>
                  {formatPaymentBadgeDetail(
                    paymentBadge,
                    Number(totals?.total ?? order?.total ?? order?.total_amount ?? 0),
                    Number(totals?.advancePaid ?? order?.advance_paid ?? 0),
                    order?.currency || "BHD",
                    lang,
                  )}
                </span>
                <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={!onUpdateOrderStatus}
                    title={
                      isAr
                        ? "انقر لتغير حالة الطلب والتنفيذ"
                        : "Click to change order fulfillment status"
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-tight transition-all hover:opacity-90 touch-manipulation focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:cursor-default",
                      getFulfillmentBadgeClasses(order?.fulfillment_status),
                    )}
                  >
                    <span>{getFulfillmentLabel(order?.fulfillment_status, lang)}</span>
                    <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isAr ? "start" : "end"} className="w-56 font-sans">
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {isAr ? "تغيير حالة الطلب والتنفيذ" : "Change Fulfillment Status"}
                  </div>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => onUpdateOrderStatus?.("sent_to_tailor", "SENT_TO_TAILOR")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Scissors className="h-4 w-4 text-purple-600 shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "تم الإرسال للخياط" : "Send to Tailor"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "SENT_TO_TAILOR" && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() =>
                      onUpdateOrderStatus?.("received_from_tailor", "RECEIVED_FROM_TAILOR")
                    }
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <PackageCheck className="h-4 w-4 text-teal-600 shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "تم الاستلام من الخياط" : "Receive from Tailor"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "RECEIVED_FROM_TAILOR" && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => onUpdateOrderStatus?.("packing", "PACKING")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "بدء التعبئة والتغليف" : "Start Packing"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "PACKING" && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => onUpdateOrderStatus?.("ready_for_pickup", "READY_FOR_PICKUP")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "جاهز للاستلام (المحل)" : "Ready for Pickup"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "READY_FOR_PICKUP" && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => onUpdateOrderStatus?.("shipped", "SHIPPED")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-sky-600 shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "تم الشحن والتسليم للمندوب" : "Mark Shipped"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "SHIPPED" && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => onUpdateOrderStatus?.("completed", "COMPLETED")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "إكمال وتسليم الطلب" : "Complete Order"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "COMPLETED" && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => onUpdateOrderStatus?.("pending", "ON_HOLD")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "قيد الانتظار" : "On Hold / Pending"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "ON_HOLD" && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => onUpdateOrderStatus?.("cancelled", "CANCELLED")}
                    className="cursor-pointer flex items-center justify-between text-destructive focus:text-destructive"
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      <span className="font-medium text-xs">
                        {isAr ? "إلغاء الطلب" : "Cancel Order"}
                      </span>
                    </div>
                    {order?.fulfillment_status === "CANCELLED" && (
                      <Check className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Right: Desktop Actions (Mobile uses sticky bottom action bar) */}
        <div className="hidden sm:flex items-center gap-2 shrink-0 ms-auto">
          {/* Custom dialog triggers like SendInvoiceDialog */}
          {children}

          {/* Primary Action Button (e.g. Receive from Tailor, Approve Payment, Hand Over) */}
          <div className="hidden sm:block">{renderPrimaryAction()}</div>

          {/* Save Button */}
          {(isCreationMode || isDirty) && (
            <Button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="h-9 px-3 text-xs font-bold gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>
                {isCreationMode
                  ? isAr
                    ? "إنشاء وحفظ"
                    : "Create & Save"
                  : isAr
                    ? "حفظ التغييرات"
                    : "Save Changes"}
              </span>
            </Button>
          )}

          {/* More Actions Dropdown */}
          {!isCreationMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-2.5 sm:px-3 text-xs font-semibold gap-1.5 rounded-xl border-border/80"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">{isAr ? "المزيد" : "More"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isAr ? "start" : "end"} className="w-48">
                {order.public_invoice_token && (
                  <DropdownMenuItem onClick={onCopyLink}>
                    <LinkIcon className="h-4 w-4 me-2 text-muted-foreground" />
                    <span>{isAr ? "نسخ رابط الفاتورة" : "Copy Invoice Link"}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onPrintReceipt}>
                  <Receipt className="h-4 w-4 me-2 text-muted-foreground" />
                  <span>{isAr ? "طباعة الإيصال (حراري)" : "Print Thermal Receipt"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onPrintA4}>
                  <Printer className="h-4 w-4 me-2 text-muted-foreground" />
                  <span>{isAr ? "طباعة الفاتورة (A4)" : "Print Invoice (A4)"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Unlock for Admin Editing */}
          {isReadOnly && isAdmin && (
            <Button
              variant="default"
              size="sm"
              onClick={onUnlock}
              className="h-9 px-3 text-xs font-bold gap-1.5 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
            >
              <Unlock className="h-4 w-4" />
              <span>{isAr ? "فتح للتعديل" : "Unlock for Editing"}</span>
            </Button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            {isAr
              ? "هذا الطلب مكتمل أو مغلق. الحقول مقفلة لحماية السجل التاريخي."
              : "This order is closed or completed. Fields are locked to preserve audit history."}
          </span>
        </div>
      )}
    </header>
  );
};
