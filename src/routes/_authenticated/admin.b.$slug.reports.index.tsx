import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n, useT } from "@/lib/i18n";
import { fetchReportingOverview } from "@/lib/reporting.functions";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { KpiCard } from "@/components/reports/kpi-card";
import { formatMoney } from "@/lib/format";
import { DollarSign, ShoppingCart, Percent, TrendingUp, AlertCircle, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/")({
  component: ReportsOverview,
});

function ReportsOverview() {
  const { lang } = useI18n();
  const t = useT();

  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });

  const [includeHistorical, setIncludeHistorical] = useState(false);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: overviewData, isLoading, error } = useQuery({
    queryKey: ["reports-overview", date?.from?.toISOString(), date?.to?.toISOString(), timezone, includeHistorical],
    queryFn: async () => {
      if (!date?.from || !date?.to) return null;
      return await fetchReportingOverview({ from: date.from, to: date.to }, timezone, includeHistorical);
    },
    enabled: !!date?.from && !!date?.to,
  });

  // For this lightweight version, we will just use the first currency returned or 'BHD' if none
  const primaryCurrencyData = overviewData && overviewData.length > 0 ? overviewData[0] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-background p-4 rounded-lg border">
        <DatePickerWithRange date={date} setDate={setDate} />
        <div className="flex items-center space-x-2">
          <Switch id="historical" checked={includeHistorical} onCheckedChange={setIncludeHistorical} />
          <Label htmlFor="historical">{lang === "ar" ? "تضمين الطلبات المؤرشفة/القديمة" : "Include historical/archived orders"}</Label>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-16 bg-muted/50 rounded-t-lg" />
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load overview data.</AlertDescription>
        </Alert>
      ) : primaryCurrencyData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title={lang === "ar" ? "قيمة الطلبات المدفوعة" : "Paid Order Value"}
              value={formatMoney(primaryCurrencyData.paid_order_value, primaryCurrencyData.currency, lang)}
              icon={<DollarSign />}
              description={lang === "ar" ? "إجمالي الإيرادات" : "Total revenue collected"}
            />
            <KpiCard
              title={lang === "ar" ? "صافي مبيعات البضائع" : "Net Merchandise Sales"}
              value={formatMoney(primaryCurrencyData.net_merch_sales, primaryCurrencyData.currency, lang)}
              icon={<TrendingUp />}
              description={lang === "ar" ? "إجمالي البضائع بعد الخصم" : "Merchandise after discounts"}
            />
            <KpiCard
              title={lang === "ar" ? "الطلبات المدفوعة" : "Paid Orders"}
              value={primaryCurrencyData.paid_order_count}
              icon={<ShoppingCart />}
            />
            <KpiCard
              title={lang === "ar" ? "الخصومات" : "Discounts"}
              value={formatMoney(primaryCurrencyData.discounts, primaryCurrencyData.currency, lang)}
              icon={<Percent />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              title={lang === "ar" ? "الشحن المحصل" : "Shipping Collected"}
              value={formatMoney(primaryCurrencyData.shipping_collected, primaryCurrencyData.currency, lang)}
              icon={<Package />}
            />
            <KpiCard
              title={lang === "ar" ? "ضريبة القيمة المضافة" : "VAT Collected"}
              value={formatMoney(primaryCurrencyData.vat_collected, primaryCurrencyData.currency, lang)}
              icon={<DollarSign />}
            />
            <KpiCard
              title={lang === "ar" ? "المصاريف التشغيلية" : "Expenses"}
              value={formatMoney(primaryCurrencyData.expenses, primaryCurrencyData.currency, lang)}
              icon={<TrendingUp className="text-destructive" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{lang === "ar" ? "معلومات مالية إضافية" : "Financial Details"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-muted-foreground">{lang === "ar" ? "المبالغ المحصلة جزئياً" : "Partial Amounts Collected"}</span>
                  <span className="font-medium">{formatMoney(primaryCurrencyData.partial_amount, primaryCurrencyData.currency, lang)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-muted-foreground">{lang === "ar" ? "إجمالي المبالغ المستردة" : "Refunded Total"}</span>
                  <span className="font-medium">{formatMoney(primaryCurrencyData.refunded_total, primaryCurrencyData.currency, lang)}</span>
                </div>
                <div className="flex justify-between items-center pb-2">
                  <span className="text-muted-foreground">{lang === "ar" ? "طلبات مجانية (100% خصم)" : "Free Completed Orders (100% Discount)"}</span>
                  <span className="font-medium">{primaryCurrencyData.free_completed_order_count}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{lang === "ar" ? "تكلفة البضاعة المباعة (COGS)" : "Cost of Goods Sold (COGS)"}</CardTitle>
                <CardDescription>
                  {lang === "ar" ? "معلومات تكلفة المنتجات" : "Product cost information"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-muted-foreground">{lang === "ar" ? "التكلفة المعروفة" : "Known COGS"}</span>
                  <span className="font-medium">{formatMoney(primaryCurrencyData.known_cogs, primaryCurrencyData.currency, lang)}</span>
                </div>
                {primaryCurrencyData.missing_cost_item_count > 0 && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{lang === "ar" ? "بيانات التكلفة مفقودة" : "Missing Cost Data"}</AlertTitle>
                    <AlertDescription>
                      {lang === "ar" 
                        ? `يوجد ${primaryCurrencyData.missing_cost_item_count} منتج مباع بدون تكلفة مسجلة (قيمة المبيعات: ${formatMoney(primaryCurrencyData.missing_cost_exposure, primaryCurrencyData.currency, lang)}). الأرباح الإجمالية غير دقيقة.`
                        : `${primaryCurrencyData.missing_cost_item_count} items were sold without a recorded cost (Sales Value: ${formatMoney(primaryCurrencyData.missing_cost_exposure, primaryCurrencyData.currency, lang)}). Gross profit calculations will be incomplete.`}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="text-center p-12 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">{lang === "ar" ? "لا توجد بيانات لهذه الفترة" : "No data available for this period."}</p>
        </div>
      )}
    </div>
  );
}
