import { MessageCircle, Package, PiggyBank, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { DashboardFinancials } from "@/features/dashboard/lib/dashboard-metrics";

/**
 * The headline cards: WhatsApp inquiries, views, top product and manual sales
 * for catalog stores; otherwise revenue and profit, AOV and gross margin (for
 * people who may see financials) and the sales count.
 */
export function primaryKpisFor({
  isCatalog,
  isAr,
  catalogInquiries,
  financials,
  canViewFinancials,
  currency,
  locale,
}: {
  isCatalog: boolean;
  isAr: boolean;
  catalogInquiries: DashboardData["catalogInquiriesQ"]["data"];
  financials: DashboardFinancials;
  canViewFinancials: boolean;
  currency: string;
  locale: string;
}) {
  return isCatalog
    ? [
        {
          label: isAr ? "استفسارات واتساب" : "WhatsApp Inquiries",
          value: `${catalogInquiries?.totalInquiries ?? 0}`,
          subValue: isAr
            ? `معدل التحويل: ${(catalogInquiries?.inquiryRate ?? 0).toFixed(1)}%`
            : `Inquiry rate: ${(catalogInquiries?.inquiryRate ?? 0).toFixed(1)}%`,
          deltaPct: null,
          icon: MessageCircle,
          color: "text-emerald-500",
          border: "hover:border-emerald-500/20",
        },
        {
          label: isAr ? "مشاهدات المنتجات" : "Product Views",
          value: `${catalogInquiries?.totalViews ?? 0}`,
          subValue: isAr
            ? `النقرات: ${catalogInquiries?.totalClicks ?? 0}`
            : `Clicks: ${catalogInquiries?.totalClicks ?? 0}`,
          deltaPct: null,
          icon: TrendingUp,
          color: "text-sky-500",
          border: "hover:border-sky-500/20",
        },
        {
          label: isAr ? "أكثر المنتجات استفساراً" : "Top Inquired Product",
          value:
            catalogInquiries?.productInquiries?.[0]?.productName ||
            (isAr ? "لا توجد استفسارات بعد" : "No inquiries yet"),
          subValue: catalogInquiries?.productInquiries?.[0]
            ? `${catalogInquiries.productInquiries[0].inquiries} ${isAr ? "استفسار" : "inquiries"}`
            : isAr
              ? "عبر واتساب"
              : "via WhatsApp",
          icon: Package,
          color: "text-blue-500",
          border: "hover:border-blue-500/20",
        },
        {
          label: isAr ? "إجمالي المبيعات المسجلة يدويًا" : "Manual Sales Recorded",
          value: `${financials.ordersCurrent}`,
          subValue: isAr ? "خلال الثلاثين يومًا الماضية" : "Over the last 30 days",
          deltaPct: financials.ordersDeltaPct,
          icon: ReceiptText,
          color: "text-indigo-500",
          border: "hover:border-indigo-500/20",
        },
      ]
    : [
        ...(canViewFinancials
          ? [
              {
                label: isAr ? "الإيرادات وصافي الربح" : "Revenue & Net Profit",
                value: formatMoney(financials.revenue, currency, locale),
                subValue: `${isAr ? "صافي الربح" : "Net Profit"}: ${formatMoney(financials.netProfit, currency, locale)}`,
                breakdown:
                  financials.incubatorRevenue > 0
                    ? isAr
                      ? `(متجر: ${formatMoney(financials.storeRevenue, currency, locale)} | حاضنات: ${formatMoney(financials.incubatorRevenue, currency, locale)})`
                      : `(Store: ${formatMoney(financials.storeRevenue, currency, locale)} | Incubators: ${formatMoney(financials.incubatorRevenue, currency, locale)})`
                    : null,
                deltaPct: financials.revenueDeltaPct,
                icon: TrendingUp,
                color: "text-emerald-500",
                border: "hover:border-emerald-500/20",
              },
              {
                label: isAr ? "متوسط قيمة الطلب" : "Average Order Value (AOV)",
                value: formatMoney(financials.aovCurrent, currency, locale),
                subValue: `${isAr ? "إجمالي الطلبات" : "Total Orders"}: ${financials.ordersCurrent}`,
                deltaPct: financials.aovDeltaPct,
                icon: Wallet,
                color: "text-sky-500",
                border: "hover:border-sky-500/20",
              },
              {
                label: isAr ? "نسبة هامش الربح الإجمالي" : "Gross Margin %",
                value: `${financials.grossMarginPercent.toFixed(1)}%`,
                subValue: `${isAr ? "تكلفة المبيعات" : "COGS"}: ${formatMoney(financials.cogs, currency, locale)}`,
                icon: PiggyBank,
                color: "text-blue-500",
                border: "hover:border-blue-500/20",
              },
            ]
          : []),
        {
          label: isAr ? "إجمالي عمليات البيع" : "Total Sales Transactions",
          value: `${financials.ordersCurrent}`,
          subValue: isAr ? "خلال الثلاثين يومًا الماضية" : "Over the last 30 days",
          deltaPct: financials.ordersDeltaPct,
          icon: ReceiptText,
          color: "text-indigo-500",
          border: "hover:border-indigo-500/20",
        },
      ];
}
