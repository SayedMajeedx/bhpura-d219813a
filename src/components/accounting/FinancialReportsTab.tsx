import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  Printer,
  TrendingUp,
  DollarSign,
  PieChart,
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from "lucide-react";
import { formatMoney } from "@/lib/format";
import { calculateIncomeStatement, calculateCashFlowStatement } from "@/lib/double-entry-ledger";

export function FinancialReportsTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;

  const [reportType, setActiveReportType] = useState<"pnl" | "cash_flow">("pnl");

  // Fetch business settings
  const settingsQ = useQuery({
    queryKey: ["dashboard-business-settings", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("card_processing_fee, benefit_processing_fee")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { card_processing_fee: 0, benefit_processing_fee: 0 };
    },
  });

  // Fetch orders
  const ordersQ = useQuery({
    queryKey: ["dashboard-orders-with-items", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch expenses
  const expensesQ = useQuery({
    queryKey: ["dashboard-expenses-full", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch cash accounts
  const accountsQ = useQuery({
    queryKey: ["cash-flow-accounts", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cash_flow_accounts")
        .select("*")
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const orders: any[] = ordersQ.data ?? [];
  const expenses: any[] = expensesQ.data ?? [];
  const accounts: any[] = accountsQ.data ?? [];
  const settings: any = settingsQ.data ?? { card_processing_fee: 0, benefit_processing_fee: 0 };

  const pnl = calculateIncomeStatement(
    orders,
    expenses,
    Number(settings.card_processing_fee || 0),
    Number(settings.benefit_processing_fee || 0),
  );

  const cashFlow = calculateCashFlowStatement(accounts, orders, expenses);

  const handleExportCSV = () => {
    let rows: string[][] = [];
    if (reportType === "pnl") {
      rows = [
        ["INCOME STATEMENT / PROFIT & LOSS REPORT", "BHD"],
        ["Gross Revenue (المبيعات والإيرادات الإجمالية)", String(pnl.grossRevenue)],
        ["Total COGS - Product & BOM Packaging (تكلفة البضاعة المباعة)", String(pnl.totalCogs)],
        ["Gross Profit (إجمالي الربح)", String(pnl.grossProfit)],
        [
          "Operating Expenses - OpEx (المصاريف التشغيلية والأجور والإيجار)",
          String(pnl.operatingExpenses),
        ],
        ["Payment Gateway Fees (رسوم بوابات الدفع)", String(pnl.paymentProcessingFees)],
        ["NET OPERATING PROFIT (صافي الربح النهائي)", String(pnl.netOperatingProfit)],
      ];
    } else {
      rows = [
        ["CASH FLOW & LIQUIDITY STATEMENT", "BHD"],
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
        <div className="flex items-center gap-2">
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
        <div className="space-y-6">
          {/* Formula Display Alert */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
            <Info className="h-5 w-5 text-primary shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-foreground block">
                {isAr
                  ? "معادلة صافي الربح الدقيقة (Net Profit Standard):"
                  : "Net Profit Standard Calculation:"}
              </span>
              <p className="text-muted-foreground font-mono mt-0.5">
                Net Profit = Revenue - Total COGS (Products + Packaging BOM) - OpEx - Gateway Fees
              </p>
            </div>
          </div>

          {/* P&L Statement Structured Table */}
          <Card className="p-6 border-border space-y-6">
            <div className="border-b border-border pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-foreground">
                  {isAr
                    ? "قائمة الدخل والأرباح والخسائر (Income Statement / P&L)"
                    : "Income Statement (P&L)"}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {isAr ? "جميع المبالغ بالدينار البحريني BHD" : "All amounts in BHD"}
                </span>
              </div>
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 font-mono text-xs"
              >
                Margin: {pnl.netProfitMarginPercent}%
              </Badge>
            </div>

            <div className="space-y-3 text-sm">
              {/* Gross Revenue */}
              <div className="flex items-center justify-between py-2 border-b border-border/60">
                <span className="font-bold text-foreground">
                  {isAr ? "إجمالي المبيعات والإيرادات (Revenue)" : "Gross Revenue"}
                </span>
                <span className="font-extrabold text-foreground text-base">
                  {formatMoney(pnl.grossRevenue, "BHD")}
                </span>
              </div>

              {/* COGS Breakdown */}
              <div className="pl-4 pr-4 space-y-1.5 py-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{isAr ? "• تكلفة المنتجات المباعة (Product Cost)" : "• Product COGS"}</span>
                  <span className="font-mono">{formatMoney(pnl.productCogs, "BHD")}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    {isAr ? "• تكلفة مواد التغليف والعلب (Packaging BOM)" : "• Packaging BOM COGS"}
                  </span>
                  <span className="font-mono">{formatMoney(pnl.packagingBomCogs, "BHD")}</span>
                </div>
              </div>

              {/* Total COGS */}
              <div className="flex items-center justify-between py-2 border-b border-border/60 bg-muted/20 px-3 rounded-lg">
                <span className="font-bold text-foreground">
                  {isAr ? "إجمالي تكلفة المبيعات (Total COGS)" : "Total COGS"}
                </span>
                <span className="font-extrabold text-amber-500">
                  - {formatMoney(pnl.totalCogs, "BHD")}
                </span>
              </div>

              {/* Gross Profit */}
              <div className="flex items-center justify-between py-2.5 border-b border-border bg-primary/5 px-3 rounded-lg">
                <span className="font-extrabold text-foreground">
                  {isAr ? "إجمالي الربح (Gross Profit)" : "Gross Profit"}
                </span>
                <span className="font-extrabold text-primary text-base">
                  {formatMoney(pnl.grossProfit, "BHD")}
                </span>
              </div>

              {/* OpEx Breakdown */}
              <div className="flex items-center justify-between py-2 border-b border-border/60">
                <span className="font-medium text-foreground">
                  {isAr
                    ? "المصاريف التشغيلية والأجور والإيجارات (OpEx)"
                    : "Operating Expenses (OpEx)"}
                </span>
                <span className="font-bold text-muted-foreground">
                  - {formatMoney(pnl.operatingExpenses, "BHD")}
                </span>
              </div>

              {/* Payment Processing Fees */}
              <div className="flex items-center justify-between py-2 border-b border-border/60">
                <span className="font-medium text-foreground">
                  {isAr
                    ? "عمولات بوابات الدفع الإلكترونية (Gateway Fees)"
                    : "Payment Processing Fees"}
                </span>
                <span className="font-bold text-muted-foreground">
                  - {formatMoney(pnl.paymentProcessingFees, "BHD")}
                </span>
              </div>

              {/* NET PROFIT FINAL */}
              <div className="flex items-center justify-between py-4 bg-primary text-primary-foreground p-4 rounded-xl shadow-lg mt-4">
                <div>
                  <span className="text-xs uppercase opacity-90 block">
                    {isAr ? "صافي الربح النهائي (Net Operating Profit)" : "Net Operating Profit"}
                  </span>
                  <span className="text-2xl font-black">
                    {formatMoney(pnl.netOperatingProfit, "BHD")}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs opacity-90 block">
                    {isAr ? "هامش صافي الربح" : "Net Margin"}
                  </span>
                  <span className="text-lg font-bold">{pnl.netProfitMarginPercent}%</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
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
              Liquidity: {formatMoney(cashFlow.totalLiquidity, "BHD")}
            </Badge>
          </div>

          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-1">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? "المقبوضات النقدية (Inflow)" : "Cash Inflow"}
                </span>
                <span className="font-extrabold text-emerald-600 text-lg">
                  {formatMoney(cashFlow.operatingCashInflow, "BHD")}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-1">
                <span className="text-xs text-muted-foreground block">
                  {isAr ? "المدفوعات والمصاريف (Outflow)" : "Cash Outflow"}
                </span>
                <span className="font-extrabold text-amber-500 text-lg">
                  - {formatMoney(cashFlow.operatingCashOutflow, "BHD")}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
              <span className="font-bold text-foreground">
                {isAr ? "صافي التدفق النقدي (Net Cash Flow)" : "Net Cash Flow"}
              </span>
              <span className="font-extrabold text-primary text-xl">
                {formatMoney(cashFlow.netCashFlow, "BHD")}
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
