import { LayoutDashboard } from "lucide-react";
import { AdminPageCount, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { countOf } from "@/lib/arabic-count";

interface DashboardCommandHeaderProps {
  lang: "ar" | "en";
  slug: string;
  brandName: string;
  salesTransactionCount: number;
  periodLabel: string;
  isCatalog?: boolean;
  inquiryCount?: number;
  /** The store sells through incubators (consignment shops); only then are they in its sales. */
  hasIncubators?: boolean;
  /** A services store: its sales are bookings, not parcels. */
  isServices?: boolean;
}

/**
 * The dashboard's heading: one row on a phone (the title and its count), so
 * today's figures come next; the line on what the figures cover waits for a
 * wider screen. The store's name is in the top bar already.
 */
export function DashboardCommandHeader({
  lang,
  salesTransactionCount,
  periodLabel,
  isCatalog = false,
  inquiryCount = 0,
  hasIncubators = true,
  isServices = false,
}: DashboardCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={LayoutDashboard}
      title={isAr ? "نظرة عامة" : "Overview"}
      badges={
        isCatalog ? (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300/40 rounded-full">
            {inquiryCount} {isAr ? "استفسار واتساب" : "inquiries"}
          </span>
        ) : (
          <AdminPageCount>
            {countOf(
              salesTransactionCount,
              isServices ? "paidBooking" : "sale",
              isAr ? "ar" : "en",
            )}
          </AdminPageCount>
        )
      }
      description={
        isCatalog
          ? isAr
            ? `استفسارات العملاء عبر واتساب وتفاعلهم مع منتجات الكتالوج خلال ${periodLabel}.`
            : `WhatsApp customer inquiries and catalog product engagement for ${periodLabel}.`
          : isServices
            ? isAr
              ? `المبالغ المحصلة من الحجوزات والطلبات خلال ${periodLabel}. افتح الطلبات للتفاصيل.`
              : `Money collected from bookings and orders for ${periodLabel}. Open Orders for the details.`
            : hasIncubators
              ? isAr
                ? `المبيعات المحصلة من الطلبات والحاضنات خلال ${periodLabel}. افتح صفحة الطلبات لعدد طلبات المتجر فقط.`
                : `Collected order and incubator sales for ${periodLabel}. Open Orders for storefront orders only.`
              : isAr
                ? `المبيعات المحصلة من الطلبات خلال ${periodLabel}. افتح صفحة الطلبات للتفاصيل.`
                : `Collected order sales for ${periodLabel}. Open Orders for the details.`
      }
    />
  );
}
