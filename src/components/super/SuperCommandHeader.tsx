import { Crown, RefreshCw } from "lucide-react";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface SuperCommandHeaderProps {
  lang: "ar" | "en";
  pendingCount: number;
  onRefresh: () => void;
}

export function SuperCommandHeader({ lang, pendingCount, onRefresh }: SuperCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Crown}
      title={isAr ? "طلبات الانضمام وأسعار المنصة" : "Tenant Requests & Platform Override"}
      badges={
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 rounded-full">
          {pendingCount} {isAr ? "طلبات معلقة" : "pending requests"}
        </span>
      }
      description={
        isAr
          ? "مراجعة واعتماد طلبات المتاجر الجديدة، تفعيل المساحات، ومعاينة إيصالات تحويلات بينفت باي."
          : "Review and deploy new merchant store requests, verify BenefitPay transfer receipts, and override platform pricing."
      }
      actions={
        <AdminPageAction
          icon={RefreshCw}
          variant="outline"
          label={isAr ? "تحديث القائمة" : "Refresh Requests"}
          iconOnPhone
          onClick={onRefresh}
        />
      }
    />
  );
}
