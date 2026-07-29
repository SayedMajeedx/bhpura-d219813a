import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n, useT } from "@/lib/i18n";
import { fetchReportingSales, ReportInterval } from "@/lib/reporting.functions";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/sales")({
  component: ReportsSales,
});

function ReportsSales() {
  const { lang } = useI18n();
  const t = useT();

  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });

  const [interval, setReportInterval] = useState<ReportInterval>("day");
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: salesData, isLoading, error } = useQuery({
    queryKey: ["reports-sales", date?.from?.toISOString(), date?.to?.toISOString(), interval, timezone, includeHistorical],
    queryFn: async () => {
      if (!date?.from || !date?.to) return null;
      return await fetchReportingSales({ from: date.from, to: date.to }, interval, timezone, includeHistorical);
    },
    enabled: !!date?.from && !!date?.to,
  });

  // Recharts requires formatted strings for tooltips/axes
  const chartData = useMemo(() => {
    if (!(salesData as any)?.timeseries) return [];
    return (salesData as any).timeseries.map((t: any) => ({
      ...t,
      displayDate: new Date(t.time_bucket).toLocaleDateString(lang === "ar" ? "ar-BH" : "en-US", {
        month: "short",
        day: "numeric",
        year: interval === "year" ? "numeric" : undefined,
      }),
    }));
  }, [salesData, lang, interval]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-background p-4 rounded-lg border">
        <div className="flex flex-col sm:flex-row gap-4">
          <DatePickerWithRange date={date} setDate={setDate} />
          <Select value={interval} onValueChange={(v) => setReportInterval(v as ReportInterval)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={lang === "ar" ? "اختر الفترة" : "Select interval"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{lang === "ar" ? "يومياً" : "Daily"}</SelectItem>
              <SelectItem value="week">{lang === "ar" ? "أسبوعياً" : "Weekly"}</SelectItem>
              <SelectItem value="month">{lang === "ar" ? "شهرياً" : "Monthly"}</SelectItem>
              <SelectItem value="year">{lang === "ar" ? "سنوياً" : "Yearly"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Switch id="historical-sales" checked={includeHistorical} onCheckedChange={setIncludeHistorical} />
          <Label htmlFor="historical-sales">{lang === "ar" ? "تضمين الأرشيف" : "Include archived"}</Label>
        </div>
      </div>

      {isLoading ? (
        <Card className="animate-pulse">
          <CardHeader className="h-16 bg-muted/50 rounded-t-lg" />
          <CardContent className="h-[400px]" />
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load sales data.</AlertDescription>
        </Alert>
      ) : salesData ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{lang === "ar" ? "المبيعات عبر الزمن" : "Sales Over Time"}</CardTitle>
              <CardDescription>
                {lang === "ar" ? "قيمة الطلبات المدفوعة وصافي مبيعات البضائع" : "Paid order value and net merchandise sales"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                      <XAxis 
                        dataKey="displayDate" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(value) => `${value}`}
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                        formatter={(value: number, name: string) => [
                          formatMoney(value, chartData[0]?.currency || 'BHD', lang), 
                          name === 'pov' ? (lang === "ar" ? "الإيرادات" : "Revenue") : (lang === "ar" ? "صافي البضائع" : "Net Merchandise")
                        ]}
                        labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold', marginBottom: '8px' }}
                      />
                      <Legend />
                      <Bar 
                        dataKey="pov" 
                        name={lang === "ar" ? "الإيرادات" : "Revenue"} 
                        fill="hsl(var(--primary))" 
                        radius={[4, 4, 0, 0]} 
                      />
                      <Bar 
                        dataKey="net_merch" 
                        name={lang === "ar" ? "صافي مبيعات البضائع" : "Net Merchandise"} 
                        fill="hsl(var(--secondary))" 
                        radius={[4, 4, 0, 0]} 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    {lang === "ar" ? "لا توجد بيانات للفترة المحددة" : "No data for selected period"}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{lang === "ar" ? "طرق الدفع" : "Payment Methods"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(salesData as any).payment_methods?.map((pm: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0">
                      <span className="font-medium capitalize">{pm.payment_method?.replace(/_/g, ' ') || 'Unknown'}</span>
                      <span>{formatMoney(pm.pov, pm.currency, lang)}</span>
                    </div>
                  ))}
                  {(!(salesData as any).payment_methods || (salesData as any).payment_methods.length === 0) && (
                    <div className="text-muted-foreground text-center py-4">No data</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{lang === "ar" ? "طرق التوصيل" : "Fulfillment Methods"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(salesData as any).fulfillment_methods?.map((fm: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0">
                      <span className="font-medium capitalize">{fm.fulfillment_method?.replace(/_/g, ' ') || 'Unknown'}</span>
                      <span>{formatMoney(fm.pov, fm.currency, lang)}</span>
                    </div>
                  ))}
                  {(!(salesData as any).fulfillment_methods || (salesData as any).fulfillment_methods.length === 0) && (
                    <div className="text-muted-foreground text-center py-4">No data</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
