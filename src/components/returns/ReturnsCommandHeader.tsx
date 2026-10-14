import { RotateCcw, Sliders, Plus, AlertCircle } from "lucide-react";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface ReturnsCommandHeaderProps {
  lang: "en" | "ar";
  brandName: string;
  totalReturns: number;
  pendingReviewCount: number;
  onOpenPolicy: () => void;
  onNewReturn?: () => void;
}

export function ReturnsCommandHeader({
  lang,
  brandName,
  pendingReviewCount,
  onOpenPolicy,
  onNewReturn,
}: ReturnsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={RotateCcw}
      title={isAr ? "مركز المرتجعات والاستبدال" : "Returns & Exchanges Center"}
      badges={
        pendingReviewCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertCircle className="h-3 w-3" />
            {pendingReviewCount} {isAr ? "بانتظار المراجعة" : "action required"}
          </span>
        )
      }
      description={
        isAr
          ? `إدارة عمليات الإرجاع، فحص الجودة، إعادة المخزون، والتعويض المالي لـ ${brandName}`
          : `Manage returns, inspection, stock recovery, and refunds for ${brandName}`
      }
      actions={
        <>
          <AdminPageAction
            icon={Sliders}
            variant="outline"
            label={isAr ? "سياسة الإرجاع" : "Return Policy"}
            iconOnPhone
            onClick={onOpenPolicy}
          />
          {onNewReturn && (
            <AdminPageAction
              icon={Plus}
              label={isAr ? "إنشاء طلب إرجاع" : "New Return"}
              short={isAr ? "إرجاع جديد" : "New"}
              onClick={onNewReturn}
            />
          )}
        </>
      }
    />
  );
}
