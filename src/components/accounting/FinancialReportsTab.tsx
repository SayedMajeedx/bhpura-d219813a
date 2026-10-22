import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, PieChart, Calculator, Info } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { calculateCashFlowStatement } from "@/lib/double-entry-ledger";
import { Link } from "@tanstack/react-router";
import type { PeriodFigures } from "@/features/expenses/lib/profit-and-loss";
import { expensesQueries } from "@/lib/data/expenses";
import { ordersQueries } from "@/lib/data/orders";
import { accountingQueries } from "@/lib/data/accounting";
import { useStoreCurrency } from "@/hooks/use-store-currency";

/**
 * The expenses page's accounting statements: the income statement is the Reports' own figures
 * for the page's period (`figures`, as the strip above shows them), and the cash flow statement
 * the store's cash accounts.
 */
export function FinancialReportsTab({
  slug,
  range,
  figures,
}: {
  slug: string;
  /** The page's period; the statement covers these days. */
  range: { from: Date; to: Date } | undefined;
  figures: PeriodFigures | null;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const currency = useStoreCurrency(brandId);
  const { modules } = useAdminStoreProfile(brandId).profile;

  const [reportType, setActiveReportType] = useState<"pnl" | "cash_flow">("pnl");

  // Every order with its lines (shared with the dashboard)
  const ordersQ = useQuery(ordersQueries.finance(brandId));

  // Expenses (shared with the expenses page and dashboard)
  const expensesQ = useQuery(expensesQueries.list(brandId));

  // Fetch cash accounts
  const accountsQ = useQuery(accountingQueries.cashAccounts(brandId));

  const orders: any[] = ordersQ.data ?? [];
  const expenses: any[] = expensesQ.data ?? [];
  const accounts: any[] = accountsQ.data ?? [];
  const period = range
    ? `${formatDate(range.from, isAr ? "ar-BH" : "en-BH")} – ${formatDate(range.to, isAr ? "ar-BH" : "en-BH")}`
    : "";
  const f = figures;

  const cashFlow = calculateCashFlowStatement(accounts, orders, expenses);

  const handleExportCSV = () => {
    let rows: string[][] = [];
    if (reportType === "pnl") {
      if (!f) return;
      rows = isAr
        ? [
            ["قائمة الدخل", currency, period],
            ["صافي المبيعات", String(f.netSales)],
            ["تكلفة المنتجات", String(f.productCost)],
            ["تكلفة التغليف", String(f.packagingCost)],
            ["تكلفة ما بيع في المحلات الشريكة", String(f.partnerCost)],
            ["تكلفة البضاعة", String(f.costOfGoods)],
            ["مجمل الربح", String(f.grossProfit)],
            ["المصاريف التشغيلية", String(f.runningCosts)],
            ["رسوم الدفع", String(f.paymentFees)],
            ["عمولات المحلات الشريكة", String(f.partnerCommissions)],
            ["الربح التشغيلي", String(f.operatingProfit)],
          ]
        : [
            ["Income statement", currency, period],
            ["Net sales", String(f.netSales)],
            ["Product cost", String(f.productCost)],
            ["Packaging cost", String(f.packagingCost)],
            ["Cost of partner shops' sales", String(f.partnerCost)],
            ["Cost of goods", String(f.costOfGoods)],
            ["Gross profit", String(f.grossProfit)],
            ["Running costs", String(f.runningCosts)],
            ["Payment fees", String(f.paymentFees)],
            ["Partner shops' commission", String(f.partnerCommissions)],
            ["Operating profit", String(f.operatingProfit)],
          ];
    } else {
      rows = [
        ["CASH FLOW & LIQUIDITY STATEMENT", currency],
        ["Cash Box Balance (الصندوق النقدي)", String(cashFlow.cashBoxBalance)],
        ["Bank / BENEFIT Account Balance (الحساب البنكي)", String(cashFlow.bankAccountBalance)],
        [
          "Total Available Liquidity (إجمالي السيولة النقدية المتاحة)",
          String(cashFlow.totalLiquidity),
        ],
        ["Operating Inflow (المقبوضات النقدية)", String(cashFlow.operatingCashInflow)],
        ["Operating Outflow (المصروفات والمدفوعات)", String(cashFlow.operatingCashOutflow)],
        ["Net Cash Flow (صافي التدفق النقدي)", String(cashFlow.netCashFlow)],
      ];
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `financial_report_${reportType}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Report Switcher & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={reportType === "pnl" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveReportType("pnl")}
            className="h-8 text-xs font-bold gap-1.5"
          >
            <Calculator className="h-3.5 w-3.5" />
            {isAr ? "قائمة الدخل والأرباح والخسائر (P&L)" : "Income Statement (P&L)"}
          </Button>
          <Button
            variant={reportType === "cash_flow" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveReportType("cash_flow")}
            className="h-8 text-xs font-bold gap-1.5"
          >
            <PieChart className="h-3.5 w-3.5" />
            {isAr ? "قائمة التدفقات النقدية (Cash Flow)" : "Cash Flow Statement"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 text-xs font-bold gap-1"
          >
            <Printer className="h-3.5 w-3.5" />
            {isAr ? "طباعة التقرير" : "Print"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExportCSV}
            className="h-8 text-xs font-bold gap-1"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? "تصدير Excel / CSV" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Main Report View */}
      {reportType === "pnl" ? (
        <IncomeStatement
          figures={f}
          currency={currency}
          lang={lang}
          period={period}
          slug={slug}
          showPackaging={Boolean(modules.packaging)}
        />
      ) : (
        /* Cash Flow Statement */
        <Card className="p-6 border-border space-y-6">
          <div className="border-b border-border pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-foreground">
                {isAr
                  ? "قائمة التدفقات النقدية والسيولة (Cash Flow Statement)"
                  : "Cash Flow Statement"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {isAr
                  ? "تتبع حركة الأموال بين الصندوق والحساب البنكي"
                  : "Cash & Bank Balance Movements"}
              </span>
            </div>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold text-xs"
            >
              Liquidity: {formatMoney(cashFlow.totalLiquidity, currency, lang)}
            </Badge>
          </div>

          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-1">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? "المقبوضات النقدية (Inflow)" : "Cash Inflow"}
                </span>
                <span className="font-extrabold text-emerald-600 text-lg">
                  {formatMoney(cashFlow.operatingCashInflow, currency, lang)}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-1">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? "المدفوعات والمصاريف (Outflow)" : "Cash Outflow"}
                </span>
                <span className="font-extrabold text-amber-500 text-lg">
                  - {formatMoney(cashFlow.operatingCashOutflow, currency, lang)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
              <span className="font-bold text-foreground">
                {isAr ? "صافي التدفق النقدي (Net Cash Flow)" : "Net Cash Flow"}
              </span>
              <span className="font-extrabold text-primary text-xl">
                {formatMoney(cashFlow.netCashFlow, currency, lang)}
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/** The income statement for the period: the Reports' figures, laid out as a statement. */
function IncomeStatement({
  figures: f,
  currency,
  lang,
  period,
  slug,
  showPackaging,
}: {
  figures: PeriodFigures | null;
  currency: string;
  lang: string;
  period: string;
  slug: string;
  showPackaging: boolean;
}) {
  const isAr = lang === "ar";
  const money = (value: number) => formatMoney(value, currency, lang);
  if (!f) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {isAr ? "جارٍ التحميل…" : "Loading…"}
      </Card>
    );
  }
  const row = (label: string, value: number, deduction = false, strong = false) => (
    <div
      className={
        strong
          ? "flex items-center justify-between gap-3 border-b border-border py-2.5 font-bold"
          : "flex items-center justify-between gap-3 border-b border-border-subtle py-2"
      }
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">
        {deduction ? `(${money(value)})` : money(value)}
      </span>
    </div>
  );
  const detail = (label: string, value: number) => (
    <div className="flex justify-between gap-3 ps-4 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{money(value)}</span>
    </div>
  );
  return (
    <Card className="space-y-4 border-border p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-foreground">
            {isAr ? "قائمة الدخل" : "Income statement"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {period} · {currency}
          </span>
        </div>
        <Badge
          variant="outline"
          className="border-primary/20 bg-primary/10 font-mono text-xs text-primary"
        >
          {isAr ? "الهامش التشغيلي" : "Operating margin"} {f.operatingMargin.toFixed(1)}%
        </Badge>
      </div>
      <div className="space-y-1.5 text-sm">
        {row(isAr ? "صافي المبيعات" : "Net sales", f.netSales, false, true)}
        {detail(isAr ? "• تكلفة المنتجات" : "• Product cost", f.productCost)}
        {(showPackaging || f.packagingCost !== 0) &&
          detail(isAr ? "• تكلفة التغليف" : "• Packaging cost", f.packagingCost)}
        {f.partnerCost !== 0 &&
          detail(
            isAr ? "• تكلفة ما بيع في المحلات الشريكة" : "• Cost of partner shops' sales",
            f.partnerCost,
          )}
        {row(isAr ? "تكلفة البضاعة" : "Cost of goods", f.costOfGoods, true)}
        {row(isAr ? "مجمل الربح" : "Gross profit", f.grossProfit, false, true)}
        {row(isAr ? "المصاريف التشغيلية" : "Running costs", f.runningCosts, true)}
        {row(isAr ? "رسوم الدفع" : "Payment fees", f.paymentFees, true)}
        {f.partnerCommissions !== 0 &&
          row(
            isAr ? "عمولات المحلات الشريكة" : "Partner shops' commission",
            f.partnerCommissions,
            true,
          )}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-primary p-4 text-primary-foreground">
          <span className="font-bold">{isAr ? "الربح التشغيلي" : "Operating profit"}</span>
          <span className="font-mono text-lg font-black tabular-nums">
            {money(f.operatingProfit)}
          </span>
        </div>
        {f.missingCosts > 0 && (
          <p className="flex items-start gap-1.5 pt-1 text-xs text-warning">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {isAr
              ? `${f.missingCosts} قطعة مبيعة بلا تكلفة مسجلة: الربح أعلى من حقيقته بقدر تكلفتها.`
              : `${f.missingCosts} pieces sold with no cost recorded: profit is overstated by their cost.`}
          </p>
        )}
      </div>
      <Link
        to="/admin/b/$slug/reports/statement"
        params={{ slug }}
        className="inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline"
      >
        {isAr
          ? "نفس أرقام التقارير. القائمة الشهرية، شهراً بشهر"
          : "The same figures as Reports. The monthly statement, month by month"}
      </Link>
    </Card>
  );
}
