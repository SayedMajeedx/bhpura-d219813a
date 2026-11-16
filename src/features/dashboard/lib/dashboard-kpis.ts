import { MessageCircle, Package, PiggyBank, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { DashboardFigures } from "@/features/dashboard/lib/dashboard-figures";

/**
 * The headline cards. A catalog store: WhatsApp inquiries, views, top product and sales recorded
 * by hand. Otherwise, for staff who see the finances, the Reports' own figures for the
 * dashboard's period (`dashboardFigures`): net sales with where they came from (the parts add up to it) and the
 * profit, the average store order, the gross margin; and for everyone the sales, the store's
 * orders and the partner shops' apart. Each beside the period before.
 */

type Kpi = {
  label: string;
  value: string;
  subValue: string;
  breakdown?: string | null;
  deltaPct?: number | null;
  icon: typeof TrendingUp;
  color: string;
  border: string;
};

export function primaryKpisFor({
  isCatalog,
  isAr,
  catalogInquiries,
  figures,
  counts,
  canViewFinancials,
  currency,
  locale,
  isServices = false,
  periodLast,
}: {
  isCatalog: boolean;
  isAr: boolean;
  catalogInquiries: DashboardData["catalogInquiriesQ"]["data"];
  /** The Reports' figures; null for staff who may not see the finances. */
  figures: DashboardFigures | null;
  /** The sales of the period, counted as Reports counts them (anyone may see these). */
  counts: {
    storeOrders: number;
    partnerSales: number;
    transactions: number;
    deltaPct?: number | null;
  };
  canViewFinancials: boolean;
  currency: string;
  locale: string;
  /**
   * A services store sells time, not goods: its bookings are not "orders", and a gross margin over
   * a cost of goods it does not have would read 100%. The margin card is kept only if some cost
   * was recorded.
   */
  isServices?: boolean;
  /** The period in words, "آخر 30 يومًا" / "the last 30 days" (`periodWords`). */
  periodLast?: string;
}): Kpi[] {
  const money = (value: number) => formatMoney(value, currency, locale);
  const before = (value: number | null | undefined, format: (v: number) => string) =>
    value === null || value === undefined
      ? ""
      : ` · ${isAr ? "السابقة" : "before"}: ${format(value)}`;
  const salesCount: Kpi = {
    label: isServices ? (isAr ? "الحجوزات" : "Bookings") : isAr ? "عمليات البيع" : "Sales",
    value: `${counts.transactions}`,
    subValue:
      counts.partnerSales > 0
        ? isAr
          ? `طلبات المتجر ${counts.storeOrders} · المحلات الشريكة ${counts.partnerSales}`
          : `Store orders ${counts.storeOrders} · partner shops ${counts.partnerSales}`
        : isAr
          ? `خلال ${periodLast ?? "آخر 30 يومًا"}`
          : `Over ${periodLast ?? "the last 30 days"}`,
    deltaPct: counts.deltaPct ?? null,
    icon: ReceiptText,
    color: "text-primary",
    border: "hover:border-primary/20",
  };

  if (isCatalog) {
    return [
      {
        label: isAr ? "استفسارات واتساب" : "WhatsApp Inquiries",
        value: `${catalogInquiries?.totalInquiries ?? 0}`,
        subValue: isAr
          ? `معدل التحويل: ${(catalogInquiries?.inquiryRate ?? 0).toFixed(1)}%`
          : `Inquiry rate: ${(catalogInquiries?.inquiryRate ?? 0).toFixed(1)}%`,
        deltaPct: null,
        icon: MessageCircle,
        color: "text-success",
        border: "hover:border-success/20",
      },
      {
        label: isAr ? "مشاهدات المنتجات" : "Product Views",
        value: `${catalogInquiries?.totalViews ?? 0}`,
        subValue: isAr
          ? `النقرات: ${catalogInquiries?.totalClicks ?? 0}`
          : `Clicks: ${catalogInquiries?.totalClicks ?? 0}`,
        deltaPct: null,
        icon: TrendingUp,
        color: "text-info",
        border: "hover:border-info/20",
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
        color: "text-info",
        border: "hover:border-info/20",
      },
      { ...salesCount, label: isAr ? "المبيعات المسجلة يدويًا" : "Sales recorded by hand" },
    ];
  }

  if (!canViewFinancials || !figures) return [salesCount];

  const showMargin = !isServices || figures.cogs > 0;
  const { sales } = figures;
  const parts = [
    sales.partners > 0.0005
      ? `${isAr ? "متجر" : "Store"}: ${money(sales.store)} | ${isAr ? "محلات شريكة" : "Partner shops"}: ${money(sales.partners)}`
      : null,
    sales.services > 0.0005 ? `${isAr ? "خدمات" : "Services"}: ${money(sales.services)}` : null,
  ].filter(Boolean);
  return [
    {
      label: isAr ? "صافي المبيعات وصافي الربح" : "Net sales and net profit",
      value: money(sales.total),
      subValue: `${isAr ? "صافي الربح" : "Net profit"}: ${money(figures.netProfit)}${
        figures.salesBefore
          ? ` · ${isAr ? "مبيعات الفترة السابقة" : "sales before"}: ${money(figures.salesBefore.total)}`
          : ""
      }`,
      breakdown: parts.length ? parts.join(" | ") : null,
      deltaPct: figures.salesDeltaPct,
      icon: TrendingUp,
      color: "text-success",
      border: "hover:border-success/20",
    },
    {
      label: isServices
        ? isAr
          ? "متوسط قيمة الحجز"
          : "Average booking"
        : isAr
          ? "متوسط طلب المتجر"
          : "Average store order",
      value: money(figures.average),
      subValue: `${isAr ? "صافي، بلا ضريبة ولا توصيل" : "Net, without VAT or delivery"}${before(figures.averageBefore, money)}`,
      deltaPct: figures.averageDeltaPct,
      icon: Wallet,
      color: "text-info",
      border: "hover:border-info/20",
    },
    ...(showMargin
      ? [
          {
            label: isAr ? "هامش مجمل الربح" : "Gross margin",
            value: `${figures.grossMarginPercent.toFixed(1)}%`,
            subValue: `${isAr ? "تكلفة البضاعة" : "Cost of goods"}: ${money(figures.cogs)}${before(figures.grossMarginBefore, (v) => `${v.toFixed(1)}%`)}`,
            icon: PiggyBank,
            color: "text-info",
            border: "hover:border-info/20",
          },
        ]
      : []),
    salesCount,
  ];
}
