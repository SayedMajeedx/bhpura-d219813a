import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { DateRange } from "react-day-picker";
import { useI18n, useT } from "@/lib/i18n";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText, AlertCircle } from "lucide-react";
import { generateExportData } from "@/lib/export.functions";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/reports/export")({
  component: ReportsExport,
});

function ReportsExport() {
  const { lang } = useI18n();
  const t = useT();

  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 30),
    to: endOfDay(new Date()),
  });

  const [reportType, setReportType] = useState<"sales" | "products" | "customers">("sales");
  const [formatType, setFormatType] = useState<"csv" | "xlsx">("xlsx");
  const [isExporting, setIsExporting] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleExport = async () => {
    if (!date?.from || !date?.to) {
      toast.error(lang === "ar" ? "يرجى تحديد فترة زمنية" : "Please select a date range");
      return;
    }

    try {
      setIsExporting(true);
      toast.info(lang === "ar" ? "جاري تحضير الملف..." : "Preparing your export...", { id: "export-toast" });

      const response = await generateExportData({
        data: {
          reportType,
          from: date.from.toISOString(),
          to: date.to.toISOString(),
          tz: timezone,
          format: formatType
        }
      });

      // Handle the download
      let blob: Blob;
      if (response.isBase64) {
        // Decode base64 to binary
        const byteCharacters = atob(response.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray], { type: response.mimeType });
      } else {
        // Plain text CSV
        blob = new Blob([response.content], { type: response.mimeType });
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = format(new Date(), "yyyy-MM-dd");
      a.download = `boutq_${reportType}_export_${dateStr}.${response.extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(lang === "ar" ? "اكتمل التصدير بنجاح" : "Export completed successfully", { id: "export-toast" });
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error(error.message || (lang === "ar" ? "فشل التصدير" : "Export failed"), { id: "export-toast" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            {lang === "ar" ? "تصدير البيانات" : "Data Export"}
          </CardTitle>
          <CardDescription>
            {lang === "ar" 
              ? "تنزيل تقارير المتجر بصيغة Excel أو CSV لتحليلها خارجياً. سيتم إخفاء معلومات الاتصال الشخصية للحفاظ على الخصوصية." 
              : "Download your store reports in Excel or CSV format for external analysis. PII (Personal Identifiable Information) is automatically stripped for privacy."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium">{lang === "ar" ? "الفترة الزمنية" : "Date Range"}</label>
            <DatePickerWithRange date={date} setDate={setDate} className="w-full sm:w-auto" />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">{lang === "ar" ? "نوع التقرير" : "Report Type"}</label>
            <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span>{lang === "ar" ? "سجل المبيعات والطلبات" : "Sales & Order Log"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="products">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span>{lang === "ar" ? "أداء المنتجات" : "Product Performance"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="customers">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span>{lang === "ar" ? "بيانات العملاء" : "Customer Data"}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">{lang === "ar" ? "صيغة الملف" : "File Format"}</label>
            <Select value={formatType} onValueChange={(v: any) => setFormatType(v)}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Excel (.xlsx) - {lang === "ar" ? "موصى به" : "Recommended"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>CSV (.csv)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formatType === "xlsx" && (
            <Alert className="bg-muted/50 border-none">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              <AlertDescription className="text-muted-foreground text-xs ml-2">
                {lang === "ar" 
                  ? "تصدير Excel محدود بـ 10,000 صف لضمان الأداء." 
                  : "Excel exports are limited to 10,000 rows to ensure performance."}
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="bg-muted/30 pt-6">
          <Button 
            onClick={handleExport} 
            disabled={!date?.from || !date?.to || isExporting}
            className="w-full sm:w-auto min-w-[200px]"
          >
            {isExporting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                {lang === "ar" ? "جاري التصدير..." : "Exporting..."}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                {lang === "ar" ? "تصدير" : "Export Data"}
              </span>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
