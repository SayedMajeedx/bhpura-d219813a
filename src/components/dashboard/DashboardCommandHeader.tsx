import type React from "react";
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
  /** The period switch, beside the title. */
  actions?: React.ReactNode;
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
  actions,
}: DashboardCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={LayoutDashboard}
      title={isAr ? "نظرة عامة" : "Overview"}
      actions={actions}
      badges={
        isCatalog ? (
          <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-bold text-success">
            {inquiryCount} {isAr ? "استفسار واتساب" : "inquiries"}
          </span>
        ) : (
          <AdminPageCount>
            {/* "0 عملية بيع" read badly: none is said in words. */}
            {salesTransactionCount === 0
              ? isServices
                ? isAr
                  ? "لا حجوزات مدفوعة بعد"
                  : "No paid bookings yet"
                : isAr
                  ? "لا مبيعات بعد"
                  : "No sales yet"
              : countOf(
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
              ? `صافي مبيعات الحجوزات والطلبات خلال ${periodLabel}، كما تحسبها التقارير.`
              : `Net sales of bookings and orders for ${periodLabel}, as Reports counts them.`
            : hasIncubators
              ? isAr
                ? `صافي مبيعات المتجر ومحلات الشركاء خلال ${periodLabel}، كما تحسبها التقارير.`
                : `Net sales of the store and its partner shops for ${periodLabel}, as Reports counts them.`
              : isAr
                ? `صافي مبيعات المتجر خلال ${periodLabel}، كما تحسبها التقارير.`
                : `Net sales of the store for ${periodLabel}, as Reports counts them.`
      }
    />
  );
}
