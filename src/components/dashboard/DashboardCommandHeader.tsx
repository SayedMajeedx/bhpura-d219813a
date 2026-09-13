import { LayoutDashboard } from "lucide-react";

interface DashboardCommandHeaderProps {
  lang: "ar" | "en";
  slug: string;
  brandName: string;
  salesTransactionCount: number;
  periodLabel: string;
  isCatalog?: boolean;
  inquiryCount?: number;
}

export function DashboardCommandHeader({
  lang,
  slug,
  brandName,
  salesTransactionCount,
  periodLabel,
  isCatalog = false,
  inquiryCount = 0,
}: DashboardCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? "ملخص المتجر" : "Store Overview"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {brandName}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{isAr ? "نظرة عامة" : "Overview"}</span>
            {isCatalog ? (
              <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300/40 rounded-full">
                {inquiryCount} {isAr ? "استفسار واتساب" : "inquiries"}
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border rounded-full">
                {salesTransactionCount} {isAr ? "عملية بيع" : "sales"}
              </span>
            )}
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isCatalog
              ? isAr
                ? `استفسارات العملاء عبر واتساب وتفاعلهم مع منتجات الكتالوج خلال ${periodLabel}.`
                : `WhatsApp customer inquiries and catalog product engagement for ${periodLabel}.`
              : isAr
                ? `المبيعات المحصلة من الطلبات والحاضنات خلال ${periodLabel}. افتح صفحة الطلبات لعدد طلبات المتجر فقط.`
                : `Collected order and incubator sales for ${periodLabel}. Open Orders for storefront orders only.`}
          </p>
        </div>

        {/* Clean telemetry header without duplicate buttons */}
      </div>
    </div>
  );
}
