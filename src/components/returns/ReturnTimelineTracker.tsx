import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  Clock,
  CheckCircle2,
  PackageCheck,
  SearchCheck,
  CircleDollarSign,
  RotateCcw,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import type { ReturnRequest } from "@/lib/returns.types";

interface ReturnTimelineTrackerProps {
  returnReq: ReturnRequest;
  lang: "en" | "ar";
}

export function ReturnTimelineTracker({ returnReq, lang }: ReturnTimelineTrackerProps) {
  const isAr = lang === "ar";

  if (returnReq.status === "rejected") {
    return (
      <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0 border border-destructive/20">
          <XCircle className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-destructive">
            {isAr ? "تم رفض طلب الإرجاع" : "Return Request Rejected"}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {returnReq.rejection_reason || (isAr ? "لم يتم تحديد سبب الرفض" : "No reason provided")}
          </p>
          {returnReq.reviewed_at && (
            <span className="text-[10px] text-muted-foreground font-mono mt-1 block">
              {formatDate(returnReq.reviewed_at, isAr ? "ar-BH" : "en-US")}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (returnReq.status === "cancelled") {
    return (
      <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0 border border-border">
          <XCircle className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground">
            {isAr ? "تم إلغاء طلب الإرجاع" : "Return Request Cancelled"}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr ? "تم إلغاء هذا الطلب من قبل العميل أو الإدارة" : "Cancelled by customer or admin"}
          </p>
        </div>
      </div>
    );
  }

  const steps = [
    {
      id: "created",
      labelAr: "تقديم الطلب",
      labelEn: "Request Submitted",
      icon: Clock,
      date: returnReq.created_at,
      completed: true,
      active: returnReq.status === "new",
    },
    {
      id: "review",
      labelAr: "الموافقة",
      labelEn: "Approved",
      icon: ShieldCheck,
      date: returnReq.reviewed_at,
      completed: ![
        "new",
        "under_review",
      ].includes(returnReq.status),
      active: returnReq.status === "under_review" || returnReq.status === "approved",
    },
    {
      id: "received",
      labelAr: "استلام المنتجات",
      labelEn: "Items Received",
      icon: PackageCheck,
      date: returnReq.received_at,
      completed: ![
        "new",
        "under_review",
        "approved",
        "awaiting_shipment",
      ].includes(returnReq.status),
      active: returnReq.status === "received" || returnReq.status === "awaiting_shipment",
    },
    {
      id: "inspected",
      labelAr: "فحص الجودة والمخزون",
      labelEn: "Quality Inspected",
      icon: SearchCheck,
      date: returnReq.inspected_at,
      completed: [
        "refunded",
        "exchanged",
        "completed",
      ].includes(returnReq.status),
      active: returnReq.status === "under_inspection",
    },
    {
      id: "settled",
      labelAr: returnReq.type === "exchange" ? "الاستبدال" : "الاسترداد المالي",
      labelEn: returnReq.type === "exchange" ? "Exchanged" : "Refund Settled",
      icon: returnReq.type === "exchange" ? RotateCcw : CircleDollarSign,
      date: returnReq.refund_processed_at || returnReq.completed_at,
      completed: ["refunded", "exchanged", "completed"].includes(returnReq.status),
      active: returnReq.status === "refunded" || returnReq.status === "exchanged",
    },
    {
      id: "completed",
      labelAr: "اكتمال المعاملة",
      labelEn: "Completed",
      icon: CheckCircle2,
      date: returnReq.completed_at,
      completed: returnReq.status === "completed",
      active: returnReq.status === "completed",
    },
  ];

  return (
    <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
        {isAr ? "مراحل دورة حياة المرتجع" : "Return Lifecycle Tracker"}
      </h3>

      <div className="relative">
        {/* Desktop / Tablet Horizontal Stepper */}
        <div className="hidden md:flex items-center justify-between gap-2 relative">
          <div className="absolute top-4 left-6 right-6 h-0.5 bg-border -z-0" />

          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className="flex flex-col items-center text-center relative z-10 flex-1"
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center border transition-all text-xs",
                    step.completed
                      ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                      : step.active
                        ? "bg-primary/10 text-primary border-primary ring-2 ring-primary/20 animate-pulse"
                        : "bg-muted/60 text-muted-foreground border-border",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={cn(
                    "text-xs mt-2 font-medium leading-tight max-w-[100px]",
                    step.completed || step.active
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  {isAr ? step.labelAr : step.labelEn}
                </span>
                {step.date && (
                  <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {formatDate(step.date, isAr ? "ar-BH" : "en-US")}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile Vertical Stepper */}
        <div className="flex md:hidden flex-col gap-3 relative pl-6 rtl:pr-6 rtl:pl-0 border-l rtl:border-r border-border ms-3 rtl:me-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="relative flex items-start gap-2.5">
                <div
                  className={cn(
                    "absolute -left-[31px] rtl:-right-[31px] top-0.5 h-6 w-6 rounded-full flex items-center justify-center border text-xs",
                    step.completed
                      ? "bg-primary text-primary-foreground border-primary"
                      : step.active
                        ? "bg-primary/10 text-primary border-primary ring-2 ring-primary/20"
                        : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <div>
                  <h4
                    className={cn(
                      "text-xs font-medium",
                      step.completed || step.active
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground",
                    )}
                  >
                    {isAr ? step.labelAr : step.labelEn}
                  </h4>
                  {step.date && (
                    <span className="text-[10px] text-muted-foreground font-mono block">
                      {formatDate(step.date, isAr ? "ar-BH" : "en-US")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
