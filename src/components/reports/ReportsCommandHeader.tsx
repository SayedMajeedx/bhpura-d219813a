import { BarChart3, ShieldCheck } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface ReportsCommandHeaderProps {
  lang: "ar" | "en";
  title?: string;
  subtitle?: string;
}

export function ReportsCommandHeader({ lang, title, subtitle }: ReportsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={BarChart3}
      title={title || (isAr ? "التقارير والتحليلات" : "Reports & Analytics")}
      description={
        subtitle ||
        (isAr
          ? "تحليل شامل لبيانات متجرك حول المبيعات والأداء والمنتجات والعملاء."
          : "Real-time analytics and revenue reporting across sales, catalog velocity, and customers.")
      }
      actions={
        <span className="hidden items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-2xs dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{isAr ? "بيانات آمنة ومحمية" : "Secure, Store-Scoped Data"}</span>
        </span>
      }
    />
  );
}
