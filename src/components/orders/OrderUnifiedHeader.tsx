import React, { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatMoney } from "@/lib/format";
import { OrderStageMenuItems } from "@/features/orders/components/OrderStageMenuItems";
import { stageChangeWarning } from "@/features/orders/lib/stage-menu";
import { getOrderTypeLabel, detectOrderType } from "@/lib/order-type-detector";
import {
  effectiveFulfillmentStatus,
  getFulfillmentLabel,
  getFulfillmentBadgeClasses,
} from "@/lib/status-labels";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useAddons } from "@/components/addons/AddonsProvider";
import { productionStagesFrom } from "@/lib/addons/addon-registry";
import {
  PAYMENT_BADGE_CLASSES,
  formatPaymentBadgeDetail,
  type PaymentBadge,
} from "@/lib/payment-status";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useOrderNumber } from "@/hooks/use-order-number";
import { AppConfirm } from "@/components/ui/app-confirm";

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
  isEditing: boolean;
  canUnlockEditing: boolean;
  isDirty: boolean;
  saving: boolean;
  paymentBadge: PaymentBadge;
  onSave: () => void;
  onUnlock: () => void;
  onCancelEditing: () => void;
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
  isEditing,
  canUnlockEditing,
  isDirty,
  saving,
  paymentBadge,
  onSave,
  onUnlock,
  onCancelEditing,
  onPrintReceipt,
  onPrintA4,
  onCopyLink,
  onOpenPaymentModal,
  onUpdateOrderStatus,
  renderPrimaryAction,
  children,
}) => {
  const orderNo = useOrderNumber();
  const router = useRouter();
  const isAr = lang === "ar";
  const shownStatus = effectiveFulfillmentStatus(
    order?.fulfillment_status,
    order?.fulfillment_method,
  );
  const { vocabulary } = useVocabulary();
  const { addons } = useAddons();
  const hasProductionStages = productionStagesFrom(addons);

  const [pendingStatus, setPendingStatus] = useState<{
    status: string;
    fulfillmentStatus: string;
  } | null>(null);
  const [confirmingStatus, setConfirmingStatus] = useState(false);

  const confirmStatusChange = async () => {
    if (!pendingStatus || !onUpdateOrderStatus) return;
    setConfirmingStatus(true);
    try {
      await onUpdateOrderStatus(pendingStatus.status, pendingStatus.fulfillmentStatus);
      setPendingStatus(null);
    } catch {
      // Keep the confirmation open so the user can retry or go back.
    } finally {
      setConfirmingStatus(false);
    }
  };

  const pendingStatusWarning = pendingStatus
    ? stageChangeWarning(order ?? {}, pendingStatus.fulfillmentStatus, lang, (amount) =>
        formatMoney(amount, order?.currency || "BHD", lang),
      )
    : null;

  const orderType = detectOrderType(items, order?.order_type);
  const orderTypeLabel = getOrderTypeLabel(orderType, lang, vocabulary);

  return (
    <header className="no-print space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-strong bg-card p-3 shadow-2xs sm:p-4">
        {/* Left: Back Arrow + Order # + Badges */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              if (
                isDirty &&
                !(await confirmDialog({
                  title: isAr ? "مغادرة الطلب دون حفظ؟" : "Leave without saving?",
                  description: isAr
                    ? "لديك تغييرات غير محفوظة في هذا الطلب، وستضيع إن غادرت."
                    : "This order has unsaved changes, and they will be lost.",
                  confirmLabel: isAr ? "مغادرة" : "Leave",
                  destructive: true,
                }))
              ) {
                return;
              }
              if (window.history.length > 2) {
                router.history.back();
              } else {
                router.navigate({ to: `/admin/b/${slug}/orders` });
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-strong bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0 touch-manipulation"
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
                  : `${isAr ? "الطلب" : "Order"} ${orderNo(order.invoice_number, order.id)}`}
              </h1>

              {/* A booking's order is a service on a date, not ready-made or made to order. */}
              {!isCreationMode &&
                order?.fulfillment_method !== "appointment" &&
                (hasProductionStages || orderType !== "ready_stock") && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/20">
                    {orderTypeLabel}
                  </span>
                )}
            </div>

            {!isCreationMode && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {formatDate(order.created_at ?? order.order_date, isAr ? "ar-BH" : "en-BH")}
              </p>
            )}
          </div>

          {/* Micro-Pills Status Group */}
          {!isCreationMode && (
            <div className="flex items-center gap-1.5 flex-wrap ms-1 sm:ms-3 border-s border-border-subtle ps-2.5 sm:ps-3">
              <button
                type="button"
                onClick={onOpenPaymentModal}
                disabled={isReadOnly || !onOpenPaymentModal}
                title={isAr ? "انقر لإدارة حالة وسجل الدفع" : "Click to manage payment lifecycle"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-tight transition-all hover:opacity-90 touch-manipulation focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-80",
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
                    disabled={isReadOnly || !onUpdateOrderStatus}
                    title={
                      isAr
                        ? "انقر لتغير حالة الطلب والتنفيذ"
                        : "Click to change order fulfillment status"
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-tight transition-all hover:opacity-90 touch-manipulation focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:cursor-default",
                      getFulfillmentBadgeClasses(shownStatus),
                    )}
                  >
                    <span>{getFulfillmentLabel(shownStatus, lang, vocabulary)}</span>
                    <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isAr ? "start" : "end"} className="w-56 font-sans">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {isAr ? "تغيير حالة الطلب والتنفيذ" : "Change Fulfillment Status"}
                  </div>
                  <DropdownMenuSeparator />

                  <OrderStageMenuItems
                    currentStage={order?.fulfillment_status}
                    lang={lang}
                    method={order?.fulfillment_method}
                    onChoose={(status, fulfillmentStatus) =>
                      setPendingStatus({ status, fulfillmentStatus })
                    }
                    vocabulary={vocabulary}
                    workshop={hasProductionStages}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* The order's steps, from a tablet up (a phone has its bar at the foot). They wrap: on a
            tablet four buttons with English labels ran 650px wide, past the screen. */}
        <div className="hidden sm:flex flex-wrap items-center justify-end gap-2 ms-auto">
          {/* Custom dialog triggers like SendInvoiceDialog */}
          {children}

          {/* Primary Action Button (e.g. Receive from Tailor, Approve Payment, Hand Over) */}
          <div className="hidden sm:block">{renderPrimaryAction()}</div>

          {isEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancelEditing}
              className="h-9 px-3 text-xs font-bold rounded-xl"
            >
              {isAr ? "إلغاء التعديل" : "Cancel Editing"}
            </Button>
          )}

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
                  className="h-9 px-2.5 sm:px-3 text-xs font-semibold gap-1.5 rounded-xl border-border-strong"
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

          {/* Existing orders open safely in view mode. */}
          {isReadOnly && canUnlockEditing && (
            <Button
              variant="default"
              size="sm"
              onClick={onUnlock}
              className="h-9 px-3 text-xs font-bold gap-1.5 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
            >
              <Unlock className="h-4 w-4" />
              <span>{isAr ? "تعديل الطلب" : "Edit Order"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* A quiet line, not a box (the admin review of 2026-11-15: a full-width amber box on every
          visit). "Edit order" is beside it on a laptop and in the thumb bar on a phone. */}
      {isReadOnly && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {isAr
            ? "عرض فقط: الحقول مقفلة حتى تضغط تعديل الطلب."
            : "View only: fields are locked until you press Edit order."}
        </p>
      )}

      {isEditing && (
        <div className="flex sm:hidden">
          <Button
            type="button"
            variant="outline"
            onClick={onCancelEditing}
            className="w-full min-h-11 font-bold rounded-xl"
          >
            {isAr ? "إلغاء التعديل" : "Cancel Editing"}
          </Button>
        </div>
      )}

      <AppConfirm
        open={Boolean(pendingStatus)}
        onOpenChange={(open) => !open && setPendingStatus(null)}
        title={isAr ? "تأكيد تغيير حالة الطلب" : "Confirm order status change"}
        description={
          isAr
            ? "سيتم تسجيل هذا التغيير في سجل نشاط الطلب وقد يؤثر في خطوات التنفيذ التالية."
            : "This change will be recorded in the order activity log and may affect the next fulfillment steps."
        }
        facts={
          pendingStatus
            ? [
                {
                  label: isAr ? "من" : "From",
                  value: getFulfillmentLabel(order?.fulfillment_status, lang, vocabulary),
                },
                {
                  label: isAr ? "إلى" : "To",
                  value: getFulfillmentLabel(pendingStatus.fulfillmentStatus, lang, vocabulary),
                },
              ]
            : undefined
        }
        destructive={pendingStatus?.fulfillmentStatus === "CANCELLED"}
        busy={confirmingStatus}
        cancelLabel={isAr ? "رجوع" : "Go Back"}
        confirmLabel={
          confirmingStatus
            ? isAr
              ? "جارٍ التحديث…"
              : "Updating…"
            : isAr
              ? "تأكيد التغيير"
              : "Confirm Change"
        }
        onConfirm={async () => {
          await confirmStatusChange();
          return false;
        }}
      >
        {pendingStatusWarning && (
          <p
            role="alert"
            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-foreground"
          >
            {pendingStatusWarning}
          </p>
        )}
      </AppConfirm>
    </header>
  );
};
