import { useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { useI18n, useT } from "@/lib/i18n";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  XCircle,
  PackageCheck,
  SearchCheck,
  CircleDollarSign,
  ArrowLeftRight,
  ReceiptText,
  User,
  Phone,
  Mail,
  MapPin,
  Clock,
  ShieldAlert,
  Loader2,
  ExternalLink,
  History,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { ReturnTimelineTracker } from "@/components/returns/ReturnTimelineTracker";
import { ReturnInspectionDialog } from "@/components/returns/ReturnInspectionDialog";
import { ReturnRefundDialog } from "@/components/returns/ReturnRefundDialog";
import { ReturnExchangeDialog } from "@/components/returns/ReturnExchangeDialog";
import { updateReturnRequestStatus } from "@/lib/returns.functions";
import { dispatchReturnNotificationSafely } from "@/lib/return-notifications";
import {
  RETURN_STATUS_CONFIG,
  RETURN_CONDITION_CONFIG,
  type ReturnRequest,
  type ReturnItem,
  type ReturnStatus,
} from "@/lib/returns.types";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/returns/$id")({
  component: ReturnDetailPage,
});

function ReturnDetailPage() {
  const brand = useBrand();
  const slug = brand?.slug;
  const { id } = useParams({ strict: false }) as { slug?: string; id?: string };
  const { profile } = useProfile();
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const language = lang;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const brandId = brand?.id;

  // Dialog states
  const [selectedInspectItem, setSelectedInspectItem] = useState<ReturnItem | null>(null);
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch Return Details
  const { data: returnReq, isLoading, refetch } = useQuery<ReturnRequest>({
    queryKey: ["admin-return-detail", brandId, id],
    queryFn: async () => {
      if (!brandId || !id) return null as any;

      const { data, error } = await (supabase as any)
        .from("return_requests")
        .select(`
          *,
          order:orders (
            id,
            invoice_number,
            total,
            subtotal,
            discount,
            currency,
            tax_amount,
            tax_rate,
            shipping,
            advance_paid,
            payment_status,
            status,
            created_at,
            customer_name_snapshot,
            customer_phone_snapshot,
            customer_email_snapshot,
            delivery_address_snapshot
          ),
          customer:customers (
            id,
            name,
            phone,
            email
          ),
          items:return_items (
            id,
            brand_id,
            return_id,
            order_item_id,
            product_id,
            variant_id,
            quantity,
            unit_price,
            total_price,
            reason,
            item_images,
            action_type,
            condition,
            restocked,
            restocked_quantity,
            restocked_at,
            inspection_notes,
            product:products (
              id,
              name_en,
              name_ar,
              image_url
            ),
            variant:product_variants (
              id,
              variant_name,
              sku,
              stock_quantity
            )
          )
        `)
        .eq("id", id)
        .eq("brand_id", brandId)
        .single();

      if (error) throw error;
      return data as ReturnRequest;
    },
    enabled: !!brandId && !!id,
  });

  // Fetch Activity Logs for this order/return
  const { data: activityLogs = [] } = useQuery({
    queryKey: ["return-activity-logs", brandId, returnReq?.order_id],
    queryFn: async () => {
      if (!brandId || !returnReq?.order_id) return [];

      const { data, error } = await (supabase as any)
        .from("activity_logs")
        .select("*")
        .eq("brand_id", brandId)
        .eq("order_id", returnReq.order_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!brandId && !!returnReq?.order_id,
  });

  const currency = (returnReq?.order as any)?.currency || (brand as any)?.currency || "BHD";

  const handleStatusChange = async (
    newStatus: ReturnStatus,
    options?: { rejectionReason?: string; adminNotes?: string },
  ) => {
    if (!brandId || !returnReq) return;
    setActionLoading(true);
    try {
      const res = await updateReturnRequestStatus(brandId, returnReq.id, newStatus, options);
      if (!res.success) {
        toast.error(res.error || (isAr ? "فشل تحديث الحالة" : "Failed to update status"));
        return;
      }

      // Safe non-blocking notification dispatch
      dispatchReturnNotificationSafely({
        brandId,
        returnId: returnReq.id,
        eventType:
          newStatus === "approved"
            ? "return_approved"
            : newStatus === "rejected"
              ? "return_rejected"
              : newStatus === "received"
                ? "return_received"
                : newStatus === "refunded"
                  ? "return_refunded"
                  : "return_created",
        recipientEmail: returnReq.customer?.email || returnReq.order?.customer_email_snapshot,
        recipientPhone: returnReq.customer?.phone || returnReq.order?.customer_phone_snapshot,
        customerName: returnReq.customer?.name || returnReq.order?.customer_name_snapshot,
        returnNumber: returnReq.return_number,
        orderInvoiceNumber: returnReq.order?.invoice_number,
        refundAmount: returnReq.net_refund_amount,
        rejectionReason: options?.rejectionReason,
      });

      toast.success(isAr ? "تم تحديث حالة المرتجع بنجاح" : "Return status updated successfully");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["admin-returns-list", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Error updating return status");
    } finally {
      setActionLoading(false);
      setRejectDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span>{isAr ? "جارِ تحميل تفاصيل المرتجع..." : "Loading return details..."}</span>
      </div>
    );
  }

  if (!returnReq) {
    return (
      <div className="p-16 text-center space-y-4">
        <h2 className="text-base font-bold text-foreground">
          {isAr ? "طلب الإرجاع غير موجود" : "Return Request Not Found"}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: (`/admin/b/${slug}/returns`) as any })}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {isAr ? "العودة لمركز المرتجعات" : "Back to Returns"}
        </Button>
      </div>
    );
  }

  const statusCfg = RETURN_STATUS_CONFIG[returnReq.status] || RETURN_STATUS_CONFIG.new;
  const isAllInspected = returnReq.items?.every((i) => i.condition !== "pending") ?? false;

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-2xs">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: (`/admin/b/${slug}/returns`) as any })}
            className="h-9 w-9 border border-border"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-mono text-foreground">
                {returnReq.return_number}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.badgeClass}`}
              >
                {isAr ? statusCfg.labelAr : statusCfg.labelEn}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-foreground border border-border">
                {returnReq.type === "exchange"
                  ? isAr
                    ? "طلب استبدال"
                    : "Exchange"
                  : isAr
                    ? "طلب إرجاع واسترداد"
                    : "Return & Refund"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "مرتبط بالفاتورة الأصلية:" : "Linked to Invoice:"}{" "}
              <Link
                to="/admin/b/$slug/orders/$id"
                params={{ slug, id: returnReq.order_id }}
                className="font-mono font-bold text-primary hover:underline inline-flex items-center gap-0.5"
              >
                #{returnReq.order?.invoice_number}
                <ExternalLink className="h-3 w-3" />
              </Link>{" "}
              • {formatDate(returnReq.created_at, isAr ? "ar-BH" : "en-US")}
            </p>
          </div>
        </div>

        {/* Workflow Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {["new", "under_review"].includes(returnReq.status) && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectDialogOpen(true)}
                disabled={actionLoading}
                className="h-9 text-xs font-semibold text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <XCircle className="h-3.5 w-3.5" />
                {isAr ? "رفض الطلب" : "Reject"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleStatusChange("approved")}
                disabled={actionLoading}
                className="h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isAr ? "قبول وتأكيد الإرجاع" : "Approve Return"}
              </Button>
            </>
          )}

          {["approved", "awaiting_shipment"].includes(returnReq.status) && (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleStatusChange("received")}
              disabled={actionLoading}
              className="h-9 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              <PackageCheck className="h-3.5 w-3.5" />
              {isAr ? "تأكيد استلام المنتجات بالمخزن" : "Mark Received at Warehouse"}
            </Button>
          )}

          {["received", "under_inspection"].includes(returnReq.status) && (
            <>
              {returnReq.type === "exchange" || returnReq.type === "both" ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setExchangeDialogOpen(true)}
                  disabled={actionLoading || !isAllInspected}
                  className="h-9 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {isAr ? "إنشاء طلب الاستبدال البديل" : "Create Exchange Order"}
                </Button>
              ) : null}

              {returnReq.type === "return" || returnReq.type === "both" ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setRefundDialogOpen(true)}
                  disabled={actionLoading || !isAllInspected}
                  className="h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  {isAr ? "معالجة الاسترداد المالي" : "Process Refund"}
                </Button>
              ) : null}
            </>
          )}

          {["refunded", "exchanged"].includes(returnReq.status) && (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleStatusChange("completed")}
              disabled={actionLoading}
              className="h-9 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isAr ? "إغلاق وأرشفة المرتجع" : "Complete & Close"}
            </Button>
          )}
        </div>
      </div>

      {/* Visual Timeline Tracker */}
      <ReturnTimelineTracker returnReq={returnReq} lang={language} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Items Inspection & Settlement Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items Inspection Card */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <SearchCheck className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? "بنود المرتجع وفحص الجودة والمخزون" : "Return Items & Stock Inspection"}
                </h3>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {returnReq.items?.length || 0} {isAr ? "بنود" : "items"}
              </span>
            </div>

            <div className="space-y-3">
              {returnReq.items?.map((item) => {
                const condCfg = RETURN_CONDITION_CONFIG[item.condition] || RETURN_CONDITION_CONFIG.pending;
                const isPending = item.condition === "pending";

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {item.product?.image_url ? (
                        <img
                          src={item.product.image_url}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border text-muted-foreground">
                          <RotateCcw className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <h4 className="text-xs font-bold text-foreground">
                          {isAr
                            ? item.product?.name_ar || item.product?.name_en
                            : item.product?.name_en || item.product?.name_ar}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          {item.variant?.variant_name || item.variant?.sku || "Default SKU"}
                        </p>
                        <div className="flex items-center gap-2 font-mono text-[11px] mt-0.5">
                          <span className="font-semibold text-foreground">
                            {isAr ? "الكمية:" : "Qty:"} {item.quantity}
                          </span>
                          <span>•</span>
                          <span className="text-muted-foreground">
                            {formatMoney(
                              Number(item.unit_price || 0),
                              currency,
                              isAr ? "ar-BH-u-nu-latn" : "en-US",
                            )}
                          </span>
                          <span>•</span>
                          <span className="font-bold text-foreground">
                            {formatMoney(
                              Number(item.total_price || 0),
                              currency,
                              isAr ? "ar-BH-u-nu-latn" : "en-US",
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <div className="text-end">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${condCfg.badgeClass}`}
                        >
                          {isAr ? condCfg.labelAr : condCfg.labelEn}
                        </span>
                        {item.restocked && (
                          <span className="block text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                            {isAr ? "تم إعادة المخزون" : "Restocked"} (+{item.restocked_quantity})
                          </span>
                        )}
                      </div>

                      {["approved", "received", "under_inspection"].includes(returnReq.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInspectItem(item);
                            setInspectDialogOpen(true);
                          }}
                          className="h-8 text-xs font-medium border-border"
                        >
                          {isPending ? (
                            isAr ? "فحص البند" : "Inspect Item"
                          ) : (
                            isAr ? "تعديل الفحص" : "Re-inspect"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reason and Customer Comments Card */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-foreground pb-2 border-b border-border">
              {isAr ? "سبب الإرجاع وملاحظات العميل" : "Return Reason & Customer Comments"}
            </h3>
            <div className="text-xs space-y-2">
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <span className="text-muted-foreground font-semibold block mb-0.5">
                  {isAr ? "السبب الأساسي:" : "Main Reason:"} {returnReq.reason}
                </span>
                {returnReq.reason_details && (
                  <p className="text-foreground leading-relaxed mt-1">
                    {returnReq.reason_details}
                  </p>
                )}
              </div>

              {returnReq.images && returnReq.images.length > 0 && (
                <div className="pt-2">
                  <span className="text-muted-foreground font-semibold block mb-1.5">
                    {isAr ? "الصور المرفقة من العميل:" : "Customer Attached Images:"}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {returnReq.images.map((imgUrl, idx) => (
                      <a
                        key={idx}
                        href={imgUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="h-16 w-16 rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity"
                      >
                        <img src={imgUrl} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity / Audit History */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <History className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                {isAr ? "سجل العمليات والنشاط غير القابل للتلاعب" : "Immutable Activity & Audit Trail"}
              </h3>
            </div>
            <div className="space-y-2">
              {activityLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg border border-border bg-muted/20 text-xs flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-foreground block">
                      {isAr ? log.message_ar || log.message_en : log.message_en || log.message_ar}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {log.action}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatDate(log.created_at, isAr ? "ar-BH" : "en-US")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Column: Customer & Financial Summary */}
        <div className="space-y-6">
          {/* Customer & Order Snapshot Card */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-foreground pb-2 border-b border-border flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span>{isAr ? "معلومات العميل والطلب" : "Customer & Order Snapshot"}</span>
            </h3>

            <div className="text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{isAr ? "اسم العميل:" : "Customer:"}</span>
                <span className="font-semibold text-foreground">
                  {returnReq.customer?.name || returnReq.order?.customer_name_snapshot || (isAr ? "عميل زائر" : "Guest")}
                </span>
              </div>

              {(returnReq.customer?.phone || returnReq.order?.customer_phone_snapshot) && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{isAr ? "رقم الهاتف:" : "Phone:"}</span>
                  <span className="font-mono text-foreground">
                    {returnReq.customer?.phone || returnReq.order?.customer_phone_snapshot}
                  </span>
                </div>
              )}

              {(returnReq.customer?.email || returnReq.order?.customer_email_snapshot) && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{isAr ? "البريد الإلكتروني:" : "Email:"}</span>
                  <span className="text-foreground">
                    {returnReq.customer?.email || returnReq.order?.customer_email_snapshot}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-muted-foreground">{isAr ? "إجمالي الفاتورة الأصلية:" : "Original Total:"}</span>
                <span className="font-mono font-bold text-foreground">
                  {formatMoney(
                    Number(returnReq.order?.total || 0),
                    currency,
                    isAr ? "ar-BH-u-nu-latn" : "en-US",
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{isAr ? "المدفوع من العميل:" : "Advance Paid:"}</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatMoney(
                    Number(returnReq.order?.advance_paid || returnReq.order?.total || 0),
                    currency,
                    isAr ? "ar-BH-u-nu-latn" : "en-US",
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Financial Settlement Breakdown Card */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? "التسوية المالية والاسترداد" : "Financial Settlement"}
                </h3>
              </div>
              <span
                className={
                  returnReq.refund_status === "processed"
                    ? "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                    : "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                }
              >
                {returnReq.refund_status === "processed"
                  ? isAr
                    ? "تم الصرف"
                    : "Processed"
                  : isAr
                    ? "معلق"
                    : "Pending"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{isAr ? "إجمالي بنود الإرجاع:" : "Total Items Value:"}</span>
                <span className="font-mono text-foreground font-medium">
                  {formatMoney(
                    Number(returnReq.total_item_refund || 0),
                    currency,
                    isAr ? "ar-BH-u-nu-latn" : "en-US",
                  )}
                </span>
              </div>

              {Number(returnReq.pro_rated_discount_deduction || 0) > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "خصم ترويجي مستقطع:" : "Pro-rated Discount:"}</span>
                  <span className="font-mono text-destructive">
                    -{formatMoney(
                      Number(returnReq.pro_rated_discount_deduction || 0),
                      currency,
                      isAr ? "ar-BH-u-nu-latn" : "en-US",
                    )}
                  </span>
                </div>
              )}

              {Number(returnReq.tax_refund || 0) > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "استرداد ضريبة (VAT):" : "Tax Refund:"}</span>
                  <span className="font-mono text-foreground">
                    +{formatMoney(
                      Number(returnReq.tax_refund || 0),
                      currency,
                      isAr ? "ar-BH-u-nu-latn" : "en-US",
                    )}
                  </span>
                </div>
              )}

              {Number(returnReq.return_fee || 0) > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "رسوم استرجاع الشحن:" : "Return Shipping Fee:"}</span>
                  <span className="font-mono text-destructive">
                    -{formatMoney(
                      Number(returnReq.return_fee || 0),
                      currency,
                      isAr ? "ar-BH-u-nu-latn" : "en-US",
                    )}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-border flex items-center justify-between font-bold text-sm">
                <span className="text-foreground">{isAr ? "صافي الاسترداد المستحق:" : "Net Refund Amount:"}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {formatMoney(
                    Number(returnReq.net_refund_amount || 0),
                    currency,
                    isAr ? "ar-BH-u-nu-latn" : "en-US",
                  )}
                </span>
              </div>

              {returnReq.refund_processed_at && (
                <div className="pt-2 border-t border-border text-[11px] text-muted-foreground space-y-1">
                  <div className="flex items-center justify-between">
                    <span>{isAr ? "طريقة الصرف:" : "Method:"}</span>
                    <span className="font-semibold text-foreground">
                      {returnReq.refund_method || "---"}
                    </span>
                  </div>
                  {returnReq.refund_reference && (
                    <div className="flex items-center justify-between">
                      <span>{isAr ? "رقم المرجع:" : "Reference:"}</span>
                      <span className="font-mono text-foreground">
                        {returnReq.refund_reference}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* If Replacement Order Exists */}
            {returnReq.replacement_order_id && (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs space-y-1">
                <span className="text-primary font-bold block">
                  {isAr ? "طلب الاستبدال المرتبط:" : "Linked Replacement Order:"}
                </span>
                <Link
                  to="/admin/b/$slug/orders/$id"
                  params={{ slug, id: returnReq.replacement_order_id }}
                  className="font-mono font-bold text-foreground hover:underline inline-flex items-center gap-1"
                >
                  {isAr ? "عرض الطلب البديل" : "View Replacement Order"}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inspection Dialog */}
      <ReturnInspectionDialog
        open={inspectDialogOpen}
        onOpenChange={setInspectDialogOpen}
        item={selectedInspectItem}
        brandId={brandId || ""}
        lang={language}
        onSuccess={() => refetch()}
      />

      {/* Refund Dialog */}
      <ReturnRefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        returnReq={returnReq}
        brandId={brandId || ""}
        currency={currency}
        lang={language}
        onSuccess={() => refetch()}
      />

      {/* Exchange Dialog */}
      <ReturnExchangeDialog
        open={exchangeDialogOpen}
        onOpenChange={setExchangeDialogOpen}
        returnReq={returnReq}
        brandId={brandId || ""}
        lang={language}
        onSuccess={() => refetch()}
      />

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-destructive">
              <ShieldAlert className="h-5 w-5" />
              {isAr ? "رفض طلب الإرجاع" : "Reject Return Request"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "سبب الرفض (يصل للعميل)" : "Rejection Reason (Visible to customer)"}
            </Label>
            <Input
              placeholder={
                isAr
                  ? "مثال: تم تجاوز فترة الإرجاع المسموحة / المنتج مستعمل..."
                  : "e.g., Exceeded return window / Item visibly used"
              }
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejectDialogOpen(false)}
              disabled={actionLoading}
              className="h-9 text-xs"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => handleStatusChange("rejected", { rejectionReason })}
              disabled={actionLoading || !rejectionReason.trim()}
              className="h-9 text-xs gap-1.5 bg-destructive text-white hover:bg-destructive/90"
            >
              {actionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isAr ? "تأكيد الرفض" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
