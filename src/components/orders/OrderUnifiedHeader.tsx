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
import { getFulfillmentLabel } from "@/lib/status-labels";
import { PAYMENT_BADGE_CLASSES, type PaymentBadge } from "@/lib/payment-status";
import { cn } from "@/lib/utils";

interface OrderUnifiedHeaderProps {
  lang: "en" | "ar";
  slug: string;
  order: any;
  items: any[];
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
  renderPrimaryAction: () => React.ReactNode;
  children?: React.ReactNode;
}

export const OrderUnifiedHeader: React.FC<OrderUnifiedHeaderProps> = ({
  lang,
  slug,
  order,
  items,
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
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-tight",
                  PAYMENT_BADGE_CLASSES[paymentBadge],
                )}
              >
                {paymentBadge}
              </span>

              <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-[11px] font-bold text-foreground">
                {getFulfillmentLabel(order.fulfillment_status, lang)}
              </span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 ms-auto">
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
